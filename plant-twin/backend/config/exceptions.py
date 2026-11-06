from rest_framework.views import exception_handler


def first_error(value):
    """Сводим вложенные ошибки сериализатора к одной понятной строке."""
    if isinstance(value, dict):
        for key, detail in value.items():
            message = first_error(detail)
            if message:
                return message if key in ("detail", "non_field_errors") else f"{key}: {message}"
        return ""
    if isinstance(value, list):
        return next((message for item in value if (message := first_error(item))), "")
    return str(value)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    codes = {
        400: "validation_error", 401: "authentication_failed", 403: "permission_denied",
        404: "not_found", 405: "method_not_allowed", 406: "not_acceptable",
        415: "unsupported_media_type", 429: "throttled",
    }
    response.data = {"error": {
        # Телеметрия задаёт точный код ошибки (unknown_device, ts_out_of_range и т. п.).
        "code": getattr(exc, "error_code", None) or codes.get(response.status_code, "api_error"),
        "message": first_error(response.data),
    }}
    return response
