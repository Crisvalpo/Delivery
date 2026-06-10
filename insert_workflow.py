import json
import sqlite3
import os
import uuid

db_path = '/home/cristian/n8n_data/database.sqlite'
json_path = '/home/cristian/n8n_data/wa_incoming_workflow.json'

if not os.path.exists(json_path):
    print(f"Error: No se encontro el archivo JSON en {json_path}")
    exit(1)

with open(json_path, 'r', encoding='utf-8') as f:
    wf = json.load(f)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Datos a insertar
wf_id = wf.get('id', 'waIncomingBot1234')
name = wf.get('name', 'LukeDelivery - Entrada WhatsApp')
active = 1
nodes_str = json.dumps(wf.get('nodes', []))
connections_str = json.dumps(wf.get('connections', {}))
settings_str = json.dumps(wf.get('settings', {}))
version_id = str(uuid.uuid4())

# Verificar si ya existe
cursor.execute("SELECT id FROM workflow_entity WHERE id = ?", (wf_id,))
row = cursor.fetchone()

if row:
    # Actualizar
    cursor.execute("""
        UPDATE workflow_entity 
        SET name = ?, active = ?, nodes = ?, connections = ?, settings = ?, versionId = ?, activeVersionId = ?, triggerCount = 1, updatedAt = datetime('now')
        WHERE id = ?
    """, (name, active, nodes_str, connections_str, settings_str, version_id, version_id, wf_id))
    print(f"Workflow {wf_id} actualizado exitosamente con versión {version_id}.")
else:
    # Insertar
    cursor.execute("""
        INSERT INTO workflow_entity 
        (id, name, active, nodes, connections, settings, versionId, activeVersionId, triggerCount, isArchived, versionCounter, createdAt, updatedAt) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, datetime('now'), datetime('now'))
    """, (wf_id, name, active, nodes_str, connections_str, settings_str, version_id, version_id))
    print(f"Workflow {wf_id} insertado exitosamente con versión {version_id}.")

# Registrar en shared_workflow para que n8n lo reconozca en el proyecto
cursor.execute("SELECT workflowId FROM shared_workflow WHERE workflowId = ?", (wf_id,))
shared_row = cursor.fetchone()

if not shared_row:
    cursor.execute("""
        INSERT INTO shared_workflow (workflowId, projectId, role, createdAt, updatedAt)
        VALUES (?, '4Y9STcspfY0Rx8rQ', 'workflow:owner', datetime('now'), datetime('now'))
    """, (wf_id,))
    print(f"Relación en shared_workflow para {wf_id} creada exitosamente.")

# Registrar activación en workflow_publish_history para que n8n lo cargue activo
cursor.execute("""
    SELECT event FROM workflow_publish_history 
    WHERE workflowId = ? 
    ORDER BY createdAt DESC LIMIT 1
""", (wf_id,))
last_event_row = cursor.fetchone()

if not last_event_row or last_event_row[0] != 'activated':
    cursor.execute("""
        INSERT INTO workflow_publish_history (workflowId, versionId, event, userId, createdAt)
        VALUES (?, ?, 'activated', 'daee4c68-f852-4e2a-896d-b23751c027d7', datetime('now'))
    """, (wf_id, version_id))
    print(f"Evento 'activated' registrado en workflow_publish_history para {wf_id}.")

conn.commit()
conn.close()
