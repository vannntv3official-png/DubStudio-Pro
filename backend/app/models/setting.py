from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class SettingModel(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
