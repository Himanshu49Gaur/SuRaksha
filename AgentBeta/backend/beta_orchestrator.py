import os
import json
import sqlite3
from typing import TypedDict, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, START, END
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sentinel_regai.db")

def get_api_key():
    key = os.getenv("GEMINI_API_KEY")
    if key:
        return key
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'gemini_api_key'")
            row = cursor.fetchone()
            conn.close()
            if row and row['value'].strip():
                return row['value'].strip()
        except Exception as e:
            print("Error loading API key from DB:", e)
    return None

class AgentState(TypedDict):
    alert_text: str
    title: Optional[str]
    map_description: Optional[str]
    department: Optional[str]
    similarity_score: Optional[float]
    evidence_text: Optional[str]
    audit_passed: Optional[bool]
    audit_score: Optional[float]
    audit_feedback: Optional[str]

class BetaOrchestrator:
    def __init__(self):
        self.ticket_pipeline = self._build_ticket_pipeline()
        self.audit_pipeline = self._build_audit_pipeline()

    def _get_llm(self):
        api_key = get_api_key()
        if not api_key:
            return None
        return ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=api_key)

    def _fallback_generate_map(self, alert_text: str):
        text_lower = alert_text.lower()
        if any(w in text_lower for w in ["cyber", "security", "encryption", "aes", "auth", "mfa", "hackathon"]):
            return "Implement Cyber & Security Controls", "Mandatory Security Action: Deploy AES-256 encryption for all sensitive PII data fields. Configure Multi-Factor Authentication (MFA) across all employee access portals. Provide a screenshot of the MFA configuration panel or a system logs document showing active AES-256 validation."
        elif any(w in text_lower for w in ["train", "hire", "employee", "hr", "conduct", "staff"]):
            return "Enforce HR Policy & Employee Training", "Mandatory HR Compliance Action: Distribute the updated compliance guidelines and Code of Conduct. Organize and log a mandatory training program for all branch managers. Submit the training attendance sheet or employee training completion log as evidence."
        elif any(w in text_lower for w in ["audit", "contract", "filing", "legal", "gdpr", "privacy", "regulation"]):
            return "Conduct Legal & Compliance Audits", "Mandatory Legal Compliance Action: Review third-party data processing contracts. Draft the compliance statement for the regulatory board. Upload a signed copy of the compliance checklist or a legal audit report document."
        elif any(w in text_lower for w in ["liquidity", "capital", "treasury", "reserve", "forex", "asset"]):
            return "Manage Treasury Liquidity & Reserves", "Mandatory Treasury Action: Update the asset-liability matching stress test parameters. Rebalance the branch capital reserves to comply with revised liquidity ratios. Submit a copy of the updated liquidity coverage ratio calculation sheet."
        else:
            return "General Compliance Action Item", "Analyze the regulatory alert, compile the required documentation, and distribute the updated compliance directives to relevant operational teams. Upload a PDF showing the email distribution list or updated compliance circular."

    def _node_generate_map(self, state: AgentState):
        alert_text = state.get("alert_text", "")
        llm = self._get_llm()
        
        from rag_pipeline import rag_pipeline
        context = rag_pipeline.retrieve_context(alert_text)
        
        if llm:
            prompt = PromptTemplate.from_template(
                """You are Agent Beta, the Compliance Orchestrator.
                Turn the following raw regulatory/compliance text into a concrete, actionable "Measurable Action Point" (MAP) for bank employees.
                
                Historical Context & Policies:
                {context}
                
                Text: "{alert_text}"
                Provide your response in JSON format with exactly the following keys:
                - "title": A short, clear task title (e.g., "Implement AES-256 encryption")
                - "map_description": A detailed, explicit, operational instruction specifying what compliance evidence needs to be submitted."""
            )
            try:
                response = llm.invoke(prompt.format(alert_text=alert_text, context=context))
                content = response.content.replace("```json", "").replace("```", "").strip()
                data = json.loads(content)
                return {"title": data.get("title"), "map_description": data.get("map_description")}
            except Exception as e:
                print("LLM Error:", e)
        
        t, m = self._fallback_generate_map(alert_text)
        return {"title": t, "map_description": m}

    def _node_route_task(self, state: AgentState):
        map_description = state.get("map_description", "")
        
        departments = ['IT', 'HR', 'Legal', 'Treasury']
        profiles = {}
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            for dept in departments:
                cursor.execute("SELECT value FROM settings WHERE key = ?", (f"skills_{dept}",))
                row = cursor.fetchone()
                profiles[dept] = row['value'] if row else ""
            conn.close()
        except Exception:
            profiles = {
                'IT': 'cybersecurity data encryption AES-256 cloud systems firewall access control authentication API security network vulnerability patch management protocol HTTPS SSL TLS',
                'HR': 'employee training hiring onboarding policy dissemination staff compliance benefits payroll labor laws workplace safety code of conduct',
                'Legal': 'compliance audits contracts review regulatory filings litigation GDPR data privacy laws SEC disclosures disclosure advisory policy drafting',
                'Treasury': 'capital adequacy liquidity risk asset liability management forex currency reserve banking audit balance sheet cost control funding capital requirements'
            }

        texts = [map_description] + [profiles[dept] for dept in departments]
        vectorizer = TfidfVectorizer()
        tfidf = vectorizer.fit_transform(texts)
        
        map_vec = tfidf[0:1]
        dept_vecs = tfidf[1:]
        
        similarities = cosine_similarity(map_vec, dept_vecs)[0]
        max_idx = similarities.argmax()
        matched_dept = departments[max_idx]
        score = float(similarities[max_idx])
        
        if score == 0:
            matched_dept = 'Legal'
            
        return {"department": matched_dept, "similarity_score": score}

    def _node_audit_evidence(self, state: AgentState):
        map_description = state.get("map_description", "")
        evidence_text = state.get("evidence_text", "")
        llm = self._get_llm()
        
        if llm:
            prompt = PromptTemplate.from_template(
                """You are Agent Beta, the Compliance Auditor.
                Evaluate if the employee-submitted compliance evidence text satisfies the requirements of the Measurable Action Point (MAP).
                MAP Requirements: "{map_description}"
                Employee Evidence Submitted: "{evidence_text}"
                Provide your response in JSON format with exactly the following keys:
                - "passed": boolean (true if the evidence satisfies the MAP, false otherwise)
                - "score": number between 0.00 and 1.00 indicating the degree of completeness and matching.
                - "feedback": a detailed summary explaining why it passed or failed and what (if anything) is missing."""
            )
            try:
                response = llm.invoke(prompt.format(map_description=map_description, evidence_text=evidence_text))
                content = response.content.replace("```json", "").replace("```", "").strip()
                data = json.loads(content)
                return {
                    "audit_passed": bool(data.get("passed", False)),
                    "audit_score": float(data.get("score", 0.0)),
                    "audit_feedback": str(data.get("feedback", "No feedback"))
                }
            except Exception as e:
                print("LLM Error:", e)

        vectorizer = TfidfVectorizer()
        try:
            tfidf = vectorizer.fit_transform([map_description, evidence_text])
            sim = float(cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0])
        except Exception:
            sim = 0.0

        passed = sim >= 0.20
        audit_score = min(1.0, sim / 0.50) if sim > 0 else 0.0
        
        if passed:
            feedback = f"Local Audit Verification: The submitted evidence contains relevant semantic matches (TF-IDF Cosine Similarity: {sim:.4f}, Scaled Score: {audit_score:.2f}). Critical terms align with the requirements of the MAP. Task verified successfully."
        else:
            feedback = f"Local Audit Verification: The submitted evidence does not show sufficient semantic overlap (TF-IDF Cosine Similarity: {sim:.4f}, Scaled Score: {audit_score:.2f}). The text appears unrelated or lacks required operational details specified in the MAP. Please review the MAP and resubmit appropriate evidence."
            
        return {"audit_passed": passed, "audit_score": audit_score, "audit_feedback": feedback}

    def _build_ticket_pipeline(self):
        workflow = StateGraph(AgentState)
        workflow.add_node("generate_map", self._node_generate_map)
        workflow.add_node("route_task", self._node_route_task)
        
        workflow.add_edge(START, "generate_map")
        workflow.add_edge("generate_map", "route_task")
        workflow.add_edge("route_task", END)
        
        return workflow.compile()

    def _build_audit_pipeline(self):
        workflow = StateGraph(AgentState)
        workflow.add_node("audit_evidence", self._node_audit_evidence)
        workflow.add_edge(START, "audit_evidence")
        workflow.add_edge("audit_evidence", END)
        return workflow.compile()

    def run_ticket_pipeline(self, alert_text: str):
        initial_state = {"alert_text": alert_text}
        result = self.ticket_pipeline.invoke(initial_state)
        return result

    def run_audit_pipeline(self, map_description: str, evidence_text: str):
        initial_state = {"map_description": map_description, "evidence_text": evidence_text}
        result = self.audit_pipeline.invoke(initial_state)
        return result

# Preserving legacy methods so main.py doesn't crash during manual ingest until updated
    def generate_map(self, alert_text):
        state = self.run_ticket_pipeline(alert_text)
        return state['title'], state['map_description']

    def route_task(self, map_description):
        # Already routed in run_ticket_pipeline if we call that directly, 
        # but to satisfy legacy, we can just run a mini graph or return placeholder
        # since it's just a refactor
        state = self._node_route_task({"map_description": map_description})
        return state['department'], state['similarity_score']

    def audit_evidence(self, map_description, evidence_text):
        state = self.run_audit_pipeline(map_description, evidence_text)
        return state['audit_passed'], state['audit_score'], state['audit_feedback']

if __name__ == "__main__":
    orchestrator = BetaOrchestrator()
    test_alert = "All branches must rebalance their cash reserves."
    print("Testing Pipeline...")
    state = orchestrator.run_ticket_pipeline(test_alert)
    print("Generated MAP:", state['title'])
    print("Routed to:", state['department'])
