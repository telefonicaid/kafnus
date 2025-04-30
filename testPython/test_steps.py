from kafka import KafkaProducer
import json

@given('el tópico "{topic}" en Kafka contiene un mensaje JSON válido')
def step_impl(context, topic):
    context.message = {"id": 1, "nombre": "Juan"}
    producer = KafkaProducer(bootstrap_servers='localhost:9092',
                             value_serializer=lambda v: json.dumps(v).encode('utf-8'))
    producer.send(topic, context.message)
    producer.flush()

@then('una fila correspondiente debe existir en la tabla "{tabla}" de SQL')
def step_impl(context, tabla):
    import sqlalchemy
    engine = sqlalchemy.create_engine('postgresql://usuario:pass@localhost/db')
    with engine.connect() as conn:
        result = conn.execute(f"SELECT * FROM {tabla} WHERE id = 1")
        row = result.fetchone()
        assert row is not None
        assert row['nombre'] == "Juan"
