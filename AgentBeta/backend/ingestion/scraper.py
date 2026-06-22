import requests
from bs4 import BeautifulSoup

class PolicyScraper:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
        
    def scrape_url(self, url: str):
        """Scrapes text from a target URL."""
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'lxml')
            
            paragraphs = soup.find_all('p')
            text_content = "\n".join([p.get_text() for p in paragraphs if len(p.get_text().strip()) > 20])
            
            return {
                "source": url,
                "title": soup.title.string if soup.title else "Scraped Policy",
                "content": text_content
            }
        except Exception as e:
            print(f"Error scraping {url}: {e}")
            return None

policy_scraper = PolicyScraper()
