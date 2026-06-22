import os
import requests
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sentinel_regai.db")

def get_slack_webhook():
    val = os.getenv("SLACK_WEBHOOK_URL")
    if val:
        return val
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'slack_webhook_url'")
            row = cursor.fetchone()
            conn.close()
            if row and row['value'].strip():
                return row['value'].strip()
        except Exception:
            pass
    return None

def dispatch_to_slack(ticket_id: int, title: str, description: str, department: str):
    """Dispatches an alert to Slack when a MAP is assigned to a department."""
    webhook_url = get_slack_webhook()
    
    if not webhook_url:
        print(f"Skipping Slack dispatch for Ticket #{ticket_id}: Webhook URL not configured.")
        return False
        
    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🚨 Urgent Compliance Alert (Ticket #{ticket_id})",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Department:*\n{department}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Task:*\n{title}"
                    }
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Action Required (MAP):*\n```{description}```"
                }
            },
            {
                "type": "divider"
            }
        ]
    }
    
    try:
        response = requests.post(webhook_url, json=payload, timeout=5)
        response.raise_for_status()
        print(f"Successfully dispatched Ticket #{ticket_id} to Slack.")
        return True
    except Exception as e:
        print(f"Error dispatching to Slack: {e}")
        return False
