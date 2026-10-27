import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import settings
from app.services.speech.service import SpeechAndAlignmentService
from app.services.subtitles.service import SubtitleService
from app.services.export.service import ExportService
from app.schemas.export import ExportConfigSchema
from app.database.session import get_project_engine
from app.models.transcript import TranscriptSegmentModel
from app.models.translation import TranslationSegmentModel
from app.utils.ffmpeg import run_ffprobe


@pytest.mark.asyncio
async def test_full_dubbing_workflow_end_to_end():
    headers = {"X-DubStudio-Token": settings.AUTH_TOKEN}
    video_path = (Path(__file__).parent.parent.parent / "test_input.mp4").resolve()
    if not video_path.exists():
        video_path = Path("test_input.mp4").resolve()
    assert video_path.exists(), f"Test video must exist at {video_path}"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Step 1: Create Project
        p_res = await ac.post(
            "/api/v1/projects",
            headers=headers,
            json={
                "name": "E2E Khmer Dubbing Test",
                "sourceLanguage": "en",
                "targetLanguage": "km",
                "syncMode": "balanced",
            },
        )
        assert p_res.status_code == 201
        project = p_res.json()
        project_id = project["id"]
        project_dir = Path(project["projectDir"])
        assert project_dir.exists()

        # Step 2: Import Media
        m_res = await ac.post(
            "/api/v1/media/import",
            headers=headers,
            json={"projectId": project_id, "filePath": str(video_path)},
        )
        assert m_res.status_code == 200
        media = m_res.json()
        assert media["durationMs"] > 0
        assert media["extractedAudioPath"] is not None
        assert Path(media["extractedAudioPath"]).exists()
        assert media["waveformPath"] is not None
        assert Path(media["waveformPath"]).exists()

        # Step 3: Populate Transcript Segments
        _, session_maker = get_project_engine(project_dir)
        async with session_maker() as session:
            seg1 = TranscriptSegmentModel(
                id="seg-1",
                project_id=project_id,
                start_ms=500,
                end_ms=3000,
                text="Hello world, welcome to DubStudio AI.",
                speaker_id="speaker_1",
                language="en",
                status="completed",
            )
            session.add(seg1)

            # Step 4: Populate Translation into Khmer
            tr1 = TranslationSegmentModel(
                id="tr-1",
                project_id=project_id,
                segment_id="seg-1",
                source_text="Hello world, welcome to DubStudio AI.",
                translated_text="សួស្តីពិភពលោក សូមស្វាគមន៍មកកាន់ការបញ្ចេញសំឡេង",
                source_language="en",
                target_language="km",
                provider="gemini",
                status="completed",
            )
            session.add(tr1)
            await session.commit()

        # Step 5 & 6: Synthesize Speech & Align Audio Timing
        audios = await SpeechAndAlignmentService.run_batch_speech_and_alignment(
            project_id=project_id,
            voice_id="km-KH-SreymomNeural",
        )
        assert len(audios) == 1
        gen_audio = audios[0]
        assert Path(gen_audio.audio_path).exists()
        assert Path(gen_audio.aligned_audio_path).exists()
        assert gen_audio.aligned_duration_ms > 0

        # Step 7: Check Timeline update
        tl_res = await ac.get(f"/api/v1/timeline/{project_id}", headers=headers)
        assert tl_res.status_code == 200
        tl_data = tl_res.json()
        dub_track = next(t for t in tl_data["tracks"] if t["type"] == "dubbed_voice")
        assert len(dub_track["clips"]) >= 1

        # Step 8: Verify Subtitle generation
        sub_res = await ac.get(f"/api/v1/subtitles/{project_id}", headers=headers)
        assert sub_res.status_code == 200
        sub_data = sub_res.json()
        assert len(sub_data["items"]) >= 1
        assert "សួស្តី" in sub_data["items"][0]["text"]

        # Step 9: Render & Export Video
        output_file = project_dir / "exports" / "test_dubbed_output.mp4"
        export_config = ExportConfigSchema(
            projectId=project_id,
            resolution="720p",
            videoCodec="h264",
            audioCodec="aac",
            outputFilePath=str(output_file),
            burnInSubtitles=False,  # Keep fast in test
            exportSubtitlesSidecar=True,
            includeOriginalAudio=True,
            originalAudioVolume=0.2,
            dubbedAudioVolume=1.0,
            backgroundMusicVolume=0.0,
        )

        rendered_path = await ExportService.render_video(export_config)
        assert Path(rendered_path).exists()
        assert Path(rendered_path).stat().st_size > 0

        # Verify sidecar subtitle
        sidecar_path = output_file.with_suffix(".srt")
        assert sidecar_path.exists()
        assert "សួស្តី" in sidecar_path.read_text(encoding="utf-8")

        # Step 10: Verify exported MP4 streams via FFprobe
        probe_info = await run_ffprobe(Path(rendered_path))
        streams = probe_info.get("streams", [])
        codecs = [s.get("codec_type") for s in streams]
        assert "video" in codecs
        assert "audio" in codecs
