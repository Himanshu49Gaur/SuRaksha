import requests
import json

class RegulatoryAPIClient:
    def __init__(self):
        pass
        
    def fetch_rbi_updates(self):
        """Mock fetching from an RBI API."""
        return [
            {
                "source": "RBI_API",
                "title": "Liquidity Coverage Ratio Update",
                "content": "All branches must rebalance their cash reserves and check capital requirements according to RBI's liquidity management plan."
            }
        ]

    def fetch_sec_updates(self):
        """Mock fetching from an SEC API."""
        return [
            {
                "source": "SEC_API",
                "title": "Data Privacy Disclosure Rule",
                "content": "Entities are required to disclose any material cybersecurity incidents within four business days. Update encryption to AES-256 for all PII by Q3."
            }
        ]

api_client = RegulatoryAPIClient()
