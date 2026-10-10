import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings


def send_price_alert_email(
    recipient: str,
    *,
    product_title: str,
    source: str,
    previous_price: float,
    new_price: float,
    percent_change: float,
    metric: str,
    threshold_pct: float,
) -> None:
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        raise RuntimeError("SMTP_HOST and SMTP_FROM_EMAIL must be configured to send alert emails")

    direction = "dropped" if percent_change < 0 else "increased"
    rule_label = "price drop" if metric == "price_drop_pct" else "price increase"

    message = EmailMessage()
    message["Subject"] = f"Price alert: {product_title}"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(
        f"A competitor price alert was triggered.\n\n"
        f"Product: {product_title}\n"
        f"Competitor: {source}\n"
        f"Previous price: {previous_price:.2f}\n"
        f"New price: {new_price:.2f}\n"
        f"Price {direction}: {abs(percent_change):.2f}%\n"
        f"Triggered rule: {rule_label} of at least {threshold_pct:.2f}%\n"
    )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.ehlo()
        if settings.SMTP_USE_TLS:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(message)