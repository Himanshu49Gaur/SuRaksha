import os
from celery import Celery
from celery.schedules import crontab

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

always_eager_default = "True" if "localhost" in redis_url or "127.0.0.1" in redis_url else "False"
always_eager = os.getenv("CELERY_ALWAYS_EAGER", always_eager_default).lower() in ("true", "1", "yes")

celery = Celery(
    "sentinel_tasks",
    broker=redis_url,
    backend=redis_url,
    include=['tasks']
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_always_eager=always_eager,
)

# Schedule periodic tasks
celery.conf.beat_schedule = {
    'run-audit-loop-every-hour': {
        'task': 'tasks.run_audit_loop',
        'schedule': crontab(minute=0, hour='*'), # run every hour
    },
}
