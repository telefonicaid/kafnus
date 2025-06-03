FROM confluentinc/cp-server-connect-base:7.9.1

RUN \
 git clone https://github.com/confluentinc/kafka-connect-jdbc.git && \
 cd kafka-connect-jdbc && \
 git checkout v10.7.0 && \
 git checkout -b geometry-support-based-on-10.7.0 && \
 git apply ../postgis-support.patch && \
 mvn clean package -DskipTests -Dcheckstyle.skip=true && \
 zip -r kafka-connect-jdbc-10.7.0.zip target/kafka-connect-jdbc-10.7.0-package target/kafka-connect-jdbc-10.7.0.jar target/manifet.json && \

COPY kafka-connect-jdbc/kafka-connect-jdbc-10.7.0.zip /tmp/kafka-connect-jdbc-10.7.0.zip

RUN confluent-hub install --no-prompt mongodb/kafka-connect-mongodb:1.16.0 && \
    #confluent-hub install --no-prompt confluentinc/kafka-connect-jdbc:10.8.4 && \
    confluent-hub install --no-prompt /tmp/kafka-connect-jdbc-10.7.0.zip
