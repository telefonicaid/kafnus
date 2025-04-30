Feature: Ingesta de datos desde Kafka a SQL

  Scenario: Mensaje válido es insertado en la tabla SQL
    Given el tópico "clientes" en Kafka contiene un mensaje JSON válido
    When el conector Kafka-SQL procesa el mensaje
    Then una fila correspondiente debe existir en la tabla "clientes" de SQL
