import logging

from app.main import configure_app_logging


def test_configure_app_logging_emits_info_without_duplicate_handlers() -> None:
    app_logger = logging.getLogger("app")
    original_handlers = list(app_logger.handlers)
    original_level = app_logger.level
    original_propagate = app_logger.propagate

    try:
        app_logger.handlers.clear()
        configure_app_logging()
        configure_app_logging()

        assert app_logger.level == logging.INFO
        assert app_logger.propagate is False
        assert len(app_logger.handlers) == 1
    finally:
        app_logger.handlers.clear()
        app_logger.handlers.extend(original_handlers)
        app_logger.setLevel(original_level)
        app_logger.propagate = original_propagate
