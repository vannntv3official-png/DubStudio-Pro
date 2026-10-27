import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import settings


@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["app"] == settings.APP_NAME


@pytest.mark.asyncio
async def test_auth_rejection():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/v1/projects")
        # Missing auth header should yield 401
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_project_lifecycle():
    headers = {"X-DubStudio-Token": settings.AUTH_TOKEN}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Create project
        create_resp = await ac.post(
            "/api/v1/projects",
            headers=headers,
            json={
                "name": "Integration Test Dubbing Project",
                "sourceLanguage": "en",
                "targetLanguage": "km",
                "syncMode": "balanced",
            },
        )
        assert create_resp.status_code == 201
        project = create_resp.json()
        project_id = project["id"]
        assert project["name"] == "Integration Test Dubbing Project"

        # 2. Get project
        get_resp = await ac.get(f"/api/v1/projects/{project_id}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == project_id

        # 3. Check default timeline tracks created
        tl_resp = await ac.get(f"/api/v1/timeline/{project_id}", headers=headers)
        assert tl_resp.status_code == 200
        tl_data = tl_resp.json()
        assert len(tl_data["tracks"]) >= 5
        track_types = [t["type"] for t in tl_data["tracks"]]
        assert "video" in track_types
        assert "original_audio" in track_types
        assert "dubbed_voice" in track_types
        assert "background_audio" in track_types
        assert "subtitles" in track_types

        # 4. Check subtitle state
        sub_resp = await ac.get(f"/api/v1/subtitles/{project_id}", headers=headers)
        assert sub_resp.status_code == 200
        sub_data = sub_resp.json()
        assert sub_data["projectId"] == project_id

        # 5. Verify transcription job endpoint schema deserialization
        tr_job_resp = await ac.post(
            "/api/v1/transcription/jobs",
            headers=headers,
            json={
                "projectId": project_id,
                "mediaAssetId": "dummy_media_id",
                "provider": "gemini",
                "sourceLanguage": "en",
            },
        )
        assert tr_job_resp.status_code == 200
        job_data = tr_job_resp.json()
        assert job_data["projectId"] == project_id
        assert job_data["type"] == "transcription"

        # 6. Verify settings update and fetch
        orig_resp = await ac.get("/api/v1/settings", headers=headers)
        orig_settings = orig_resp.json()

        settings_update_resp = await ac.put(
            "/api/v1/settings",
            headers=headers,
            json={
                "theme": "dark",
                "accentColor": "#3B82F6",
                "aiProviders": {
                    "geminiApiKey": "dummy_test_key",
                    "geminiModel": "gemini-2.5-flash",
                },
            },
        )
        assert settings_update_resp.status_code == 200
        saved_settings = settings_update_resp.json()
        assert saved_settings["aiProviders"]["geminiApiKey"] == "dummy_test_key"
        assert saved_settings["aiProviders"]["geminiModel"] == "gemini-2.5-flash"

        # Restore original settings so tests do not pollute user's active database
        await ac.put("/api/v1/settings", headers=headers, json=orig_settings)
