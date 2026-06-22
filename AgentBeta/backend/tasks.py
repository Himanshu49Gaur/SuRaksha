from celery_app import celery
from alpha_scanner import AlphaScanner
from beta_orchestrator import BetaOrchestrator
from database import get_db_connection

# Initialize models lazily
scanner = None
orchestrator = None

def get_scanner():
    global scanner
    if scanner is None:
        scanner = AlphaScanner()
    return scanner

def get_orchestrator():
    global orchestrator
    if orchestrator is None:
        orchestrator = BetaOrchestrator()
    return orchestrator

def process_scanned_segments(document_name, segments, threshold):
    conn = get_db_connection()
    cursor = conn.cursor()
    escalated_count = 0
    orch = get_orchestrator()
    
    for seg in segments:
        content = seg["content"]
        rscore = seg["rscore"]
        is_escalated = 1 if rscore >= threshold else 0
        
        cursor.execute("""
        INSERT INTO alerts (document_name, content, rscore, is_escalated, status)
        VALUES (?, ?, ?, ?, ?)
        """, (document_name, content, rscore, is_escalated, "escalated" if is_escalated else "dismissed"))
        alert_id = cursor.lastrowid
        
        if is_escalated:
            escalated_count += 1
            state = orch.run_ticket_pipeline(content)
            title = state['title']
            map_desc = state['map_description']
            dept = state['department']
            similarity = state['similarity_score']
            
            cursor.execute("""
            INSERT INTO tickets (alert_id, title, description, department, similarity_score, status)
            VALUES (?, ?, ?, ?, ?, 'Open')
            """, (alert_id, title, map_desc, dept, similarity))
            ticket_id = cursor.lastrowid
            
            from integrations import dispatch_to_slack
            dispatch_to_slack(ticket_id, title, map_desc, dept)
            
    conn.commit()
    conn.close()
    return escalated_count

@celery.task
def process_document_task(file_path, filename, threshold):
    """Background task to scan a document and generate tickets."""
    s = get_scanner()
    results = s.scan_document(file_path, threshold=threshold)
    escalated_count = process_scanned_segments(filename, results, threshold)
    return {"status": "completed", "escalated_count": escalated_count, "total_segments": len(results)}

@celery.task
def run_audit_loop():
    """Background task to continuously recheck tickets in submitted state."""
    orch = get_orchestrator()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, description, evidence_text, evidence_file FROM tickets WHERE evidence_text IS NOT NULL AND status IN ('Submitted', 'Rejected', 'Open')")
    rows = cursor.fetchall()
    
    audited_count = 0
    for row in rows:
        ticket_id = row['id']
        map_desc = row['description']
        evidence_text = row['evidence_text']
        
        state = orch.run_audit_pipeline(map_desc, evidence_text)
        passed = state['audit_passed']
        score = state['audit_score']
        feedback = state['audit_feedback']
        status = "Approved" if passed else "Rejected"
        
        cursor.execute("""
        UPDATE tickets
        SET status = ?, audit_score = ?, audit_feedback = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """, (status, score, feedback, ticket_id))
        audited_count += 1
        
    conn.commit()
    conn.close()
    return {"status": "completed", "audited_count": audited_count}

@celery.task
def ingest_source_task(source_type: str, url: str = None, threshold: float = 0.50):
    """Background task to fetch data from APIs or Web and process it."""
    from ingestion.api_clients import api_client
    from ingestion.scraper import policy_scraper
    
    docs = []
    
    if source_type == "RBI":
        docs = api_client.fetch_rbi_updates()
    elif source_type == "SEC":
        docs = api_client.fetch_sec_updates()
    elif source_type == "WEB" and url:
        doc = policy_scraper.scrape_url(url)
        if doc:
            docs.append(doc)
    else:
        return {"status": "failed", "reason": "Invalid source_type or missing url"}
        
    total_escalated = 0
    s = get_scanner()
    
    for doc in docs:
        document_name = doc["title"]
        text_content = doc["content"]
        
        rscore = s.score_segment(text_content)
        segments = [{"content": text_content, "rscore": rscore}]
        
        escalated_count = process_scanned_segments(document_name, segments, threshold)
        total_escalated += escalated_count
        
    return {"status": "completed", "documents_processed": len(docs), "escalated_count": total_escalated}
