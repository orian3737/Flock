import os


def allowed_origins():
    origins = os.getenv("FRONTEND_ORIGINS")
    if origins:
        return [origin.strip() for origin in origins.split(",") if origin.strip()]
    return ["http://localhost:5173", "https://orian3737.github.io"]
