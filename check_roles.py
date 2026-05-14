"""Check roles data in published playbooks to diagnose missing opening card."""
import os, sys, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")
client = create_client(url, key)

# Get all playbooks with their roles
result = client.table("playbooks").select("id, case_id, review_status, roles").order("created_at", desc=True).execute()

for pb in result.data:
    case = client.table("cases").select("title, status").eq("id", pb["case_id"]).limit(1).execute().data
    case_title = case[0]["title"] if case else "Unknown"
    case_status = case[0]["status"] if case else "?"
    print(f"\n[{case_status}/{pb['review_status']}] {case_title}")
    print(f"  Playbook: {pb['id']}")
    roles = pb.get("roles") or []
    for role in roles[:2]:  # show first 2 roles as sample
        name = role.get("name", "?")
        has_desc = bool(role.get("opening_role_description"))
        has_topics = bool(role.get("opening_topics"))
        has_question = bool(role.get("opening_suggested_question"))
        has_statement = bool(role.get("opening_statement"))
        print(f"  Role: {name}")
        print(f"    opening_role_description: {'✓ ' + role['opening_role_description'][:60] if has_desc else '✗ MISSING'}")
        print(f"    opening_topics:           {'✓ ' + str(len(role['opening_topics'])) + ' topics' if has_topics else '✗ MISSING'}")
        print(f"    opening_suggested_question: {'✓ ' + role['opening_suggested_question'][:60] if has_question else '✗ MISSING'}")
        print(f"    opening_statement:        {'✓ present' if has_statement else '✗ MISSING'}")
