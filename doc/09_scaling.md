# ⚖️ Scaling Kafka and Kafnus NGSI

This document explains the fundamental principles behind scaling Kafka and Kafnus NGSI stream processors. It focuses on how Kafka topics, partitions, and consumer groups interact, and how this impacts performance, throughput, and horizontal scalability in the context of smart city deployments using FIWARE.

---

## 🧠 Core Concepts

### 📦 Kafka Topics and Partitions

A **Kafka topic** is a logical channel where events (messages) are published. Each topic is split into one or more **partitions**, which are the unit of parallelism in Kafka.

- A **partition** is an ordered, append-only log of records.
- A topic with multiple partitions enables multiple consumers to process data in parallel.
- Partitions are **immutable and sequential**, meaning Kafka guarantees order **within a partition**, but not across partitions.

> ✅ A topic must be defined with enough partitions if we expect to scale its processing workload.

![Topics with partitions](../doc/images/TopicAndPartitions.png)

---

### 🧑‍🤝‍🧑 Kafka Consumers, Groups, and Parallelism

Kafka enables parallel data processing through **topic partitions** and **consumer groups**. This is the foundation for horizontal scalability in Kafnus NGSI.

---

#### 🔁 How it works

- A **Kafka topic** is split into one or more **partitions**.
- Each **consumer** in a **consumer group** is assigned one or more partitions.
- A **partition is always read by only one consumer** in the group.
- Kafka distributes partitions **automatically** among available consumers.

📌 Kafka ensures **message order within a partition**, but not across partitions.

---

#### 🔢 Distribution Scenarios

| Partitions | Consumers | Distribution                        |
|------------|-----------|-------------------------------------|
| 4          | 2         | Each consumer gets 2 partitions     |
| 4          | 4         | Each consumer gets 1 partition      |
| 4          | 6         | Only 4 consumers are active, 2 idle |

> ⚠️ The number of **active consumers** cannot exceed the number of **partitions**.

---

#### 🖼️ Visual Examples

These diagrams illustrate how Kafka assigns partitions depending on the number of consumers:

1. One consumer group with one consumer  
   ![Schema with one consumer group and one consumer](../doc/images/PartitionsConsumerGroups1.png)

2. One consumer group with just enough consumers  
   ![Schema with one consumer group and just enough consumers](../doc/images/PartitionsConsumerGroups2.png)

3. One consumer group with too many consumers  
   ![Schema with one consumer group and too many consumers](../doc/images/PartitionsConsumerGroups3.png)

4. Two consumer groups with multiple consumers (partitions are read two times)
   ![Schema with two consumer groups and multiple consumers](../doc/images/PartitionsConsumerGroups4.png)

---

## 🔀 Message Distribution and Multi-Agent Processing

In a Kafka-based architecture like Kafnus, achieving effective horizontal scaling depends not only on the number of partitions or consumers but also on how messages are distributed and how processing is organized. This section explains two key aspects that enable scalability and consistency: **partitioning by key**, and **multi-agent stream processing**.

---

### 🧩 Key-Based Message Distribution

Kafka distributes incoming messages to topic partitions based on their **key**. This key determines which partition a message will land in.

> ⚠️ If no key is provided, messages are distributed randomly — which may lead to poor locality or inconsistent processing.

In the context of Kafnus:

- Each incoming NGSI notification should ideally use the **entity ID (`entityid`) as the Kafka message key**.
- This ensures that all updates for a single entity go to the **same partition**, preserving **message ordering** for that entity.
- Proper partitioning enables **parallel processing across entities**, while maintaining consistency **within** each entity's data stream.

📌 **Important Note**: With upcoming changes to the JDBC connector that will make message ordering irrelevant during processing, strict partitioning by entity ID may become optional. The connector will handle proper sequencing during database insertion regardless of message arrival order.

📌 **If all messages go to the same partition (e.g., due to missing keys)**, no matter how many consumers or pods are deployed, **only one will be active**. This creates a bottleneck.

![Distributing messages by key](../doc/images/ProducerKeyKafka.png)

Another useful example can be found [here](../doc/images/ProducerMesssageKeys.png).

---

### 🧠 Multi-Agent Stream Processing in Kafnus

Kafnus NGSI is organized into multiple **agents**, each dedicated to processing a specific type of NGSI data flow. This modular design improves scalability, clarity, and control.

| Agent        | Input Topic        | Output Topic(s)         | Purpose                         |
|--------------|--------------------|--------------------------|----------------------------------|
| `historic`   | `<PREFIX>raw_historic`     | `<PREFIX><service><SUFFIX>`              | Store full historical records   |
| `lastdata`   | `<PREFIX>raw_lastdata`     | `<PREFIX><service>_lastdata<SUFFIX>`     | Store latest entity state       |
| `mutable`    | `<PREFIX>raw_mutable`      | `<PREFIX><service>_mutable<SUFFIX>`      | Allow overwrites / updates      |
| `errors`     | `<PREFIX>raw_errors`       | `<PREFIX><db>_error_log<SUFFIX>`         | Reconstruct and log DB errors   |

Each agent:

- Runs independently and listens to its own topic.
- Applies logic specific to the flow it handles.
- Sends output to dynamically generated processed topics, routed by headers.

---

### 🧠 Why Per-Agent Processing Matters

#### ✅ Independent Scaling
Each agent can be deployed and scaled independently:

- `historic` agent may require more throughput (more partitions, more pods).
- `errors` agent may only need a single replica.

#### ✅ Isolated Logic
Each agent encapsulates its transformation logic. For example:

- `historic` always includes `TimeInstant` in the primary key.
- `lastdata` compares timestamps to store only the latest known version.
- `errors` parses Kafka Connect failure records into structured logs.

---

### ⚠️ Ordering Guarantees in `lastdata`

The `lastdata` agent currently requires **strict ordering by `TimeInstant`** to ensure only the most recent update is retained. To achieve this:

- All messages for a given entity **must be processed in order**.
- Kafka guarantees ordering **within a partition** only.
- Therefore, **all messages for the same entity must land in the same partition**.

✅ This is currently achieved by **using `entityid` as the Kafka key**.

> 💡 **Future Consideration**: If the JDBC connector changes eliminate the need for strict ordering, this constraint could be relaxed, potentially improving throughput by allowing more flexible partitioning strategies.

> ❌ Currently, if updates for the same entity are spread across partitions, one consumer may process an old timestamp **after** another has already written a newer one — leading to **data inconsistency**.

---

### 🧠 Implications for Node.js Migration

When migrating from Python (Faust) to Node.js (`@confluentinc/kafka-javascript`):

- The per-agent architecture should be preserved.
- Each agent becomes a **separate consumer process** or **worker module**.
- Each agent subscribes to a specific topic and applies dedicated logic.
- Message keys and partitioning logic **must match** the current design to preserve behavior.

---

## 🚀 Scaling Strategies

### Node.js (`@confluentinc/kafka-javascript`)

The new Node.js version of Kafnus-NGSI supports **horizontal scaling**.

#### Development Environment (Docker)

- You can use a single container with multiple **threads or processes**.
- In Faust, you can use `--concurrency=4` to enable parallel processing.
- This works well for local development and testing.

---

### 🏗️ Production Environment (Kubernetes)

In production, the recommended approach for scaling `kafnus-ngsi` is to:

- Set `--concurrency=1` (for Python/Faust) so that each **pod runs as a single consumer**.
- Use **multiple pods (replicas)** to scale horizontally.
- Use a **shared consumer group** per agent (e.g., `ngsi-agent-historic`) so Kafka can **distribute partitions**.

> 🧠 The number of Kafka **topic partitions should be ≥ number of pods** to ensure effective parallelism.

#### 🔁 Consumer Group Distribution

When all pods share the **same `group.id`**, Kafka distributes topic partitions across them:

![Scaling with Kubernetes](../doc/images/ScalingKubernetes.png)

> 📝 **Edit source**: You can view and modify the diagram using [Excalidraw](https://excalidraw.com/#room=e06782c4fdd1d900246a,f_sdKK90w0FsFWKnDWsYmw).

- **Same group ID ➔ cooperative consumers**  
  All pods act as a single consumer group, so **each partition is assigned to only one pod at a time**. This prevents duplicate processing.

- **Automatic rebalancing**  
  When pods are added or removed (scaling up or down), Kafka automatically **rebalances partitions** across the active pods to distribute the load as evenly as possible.

- **Offset retention**  
  When a partition moves from one pod to another, the new pod **continues reading from the last committed offset**, so no data is lost or processed twice.

- **Number of partitions = max active pods**  
  To achieve maximum parallelism, you should ensure the **number of topic partitions is greater than or equal to the maximum number of pods** you plan to scale up to. Extra pods beyond the number of partitions will remain idle.

- **Order guarantees within a partition**  
  Kafka guarantees **message order only within a partition**, so to preserve correct ordering for a given key (e.g., `entityid`), make sure **all messages for that key are routed to the same partition**.

---

### Java-based kafnus-ngsi

If using a Java version (e.g., Kafka Streams or custom implementation), the recommendation is:

- Prefer **vertical scaling** (increase CPU & RAM).
- Keep a **single replica**, since Java threading model allows efficient in-process parallelism.
- Use multiple threads internally to handle partitions.

---

## 📐 Partitioning Guidelines

When defining Kafka topics (e.g., `<PREFIX>raw_historic`, `<PREFIX>raw_lastdata`, `<PREFIX>raw_mutable`), consider:

- Initial number of partitions per topic: **4–8** (adjustable later).
- Use Kafka metrics (consumer lag, throughput) to decide when to **increase partitions**.
- Be aware that **increasing partitions after deployment requires careful handling**, especially if using upsert logic or ordering-sensitive workflows.

---

## 📈 Autoscaling Example (Kubernetes)

Although Kubernetes is not the only deployment target, here’s a brief autoscaling setup for reference:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: kafnus-ngsi-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: kafnus-ngsi
  minReplicas: 1
  maxReplicas: 6
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## ➕ Adding Partitions When Order Doesn't Matter

### Key Facts About Partition Scaling

**When message ordering is not important** (as in your case):

✅ **You can freely increase partitions** when more parallelism is needed  
✅ **New messages** will distribute across all partitions (existing and new)  
✅ **Existing messages** remain in their original partitions  

### Important Considerations

1. **Partitions cannot be decreased**  
   - Kafka only allows increasing partitions, not reducing them  
   - Plan with reasonable headroom  

2. **Minor Kafka performance impact**  
   - More partitions = more files for brokers to manage  
   - Can slightly affect performance if overused  
   - Recommendation: Avoid creating hundreds of "just in case" partitions  

### When to Increase Partitions

Consider adding partitions when:  
- You need to scale beyond your current partition count  
- Pods are consistently at capacity  
- Persistent consumer lag is observed  

### How to Increase Partitions

```bash
kafka-topics --alter --topic your_topic \
  --partitions NEW_COUNT --bootstrap-server kafka:9092
```

After changing:
- Kafka will automatically rebalance
- New messages will use all available partitions
- You can scale pods to utilize the new partitions

---

## ✅ Summary

### 🔧 Component Scaling Overview

| Component             | Scale Type   | Strategy                            |
|----------------------|--------------|-------------------------------------|
| Kafka Topics          | Horizontal   | Increase partitions                 |
| kafnus-ngsi (Node.js) | Horizontal   | More pods, 1 process per partition  |
| kafnus-ngsi (Java)    | Vertical     | More CPU/RAM per instance, threads  |

---

### 📐 Key Principles for Scalability and Consistency

| Principle                         | Why It Matters                                                                 |
|----------------------------------|--------------------------------------------------------------------------------|
| **Partition-per-entityid**       | Ensures per-entity ordering and parallelism                                   |
| **One consumer per partition**   | Prevents duplicated processing and guarantees consistency                     |
| **Consumer groups**              | Enable pods to share load while reading different partitions                  |
| **Agent separation**             | Lets each NGSI flow scale independently and isolate logic                     |
| **Offset retention**             | Allows new pods to resume processing where others left off after rebalance    |
| **Min partitions ≥ max replicas**| Ensures all pods are utilized when scaling up                                 |
| **Kafka handles rebalance**      | When pods are added/removed, Kafka redistributes partitions automatically     |
| **Preserve ordering in lastdata**| Prevents outdated state overrides by ensuring entity updates are sequential   |
| **No key = random partition**    | Can break consistency and block horizontal scaling                            |

---


## 🧭 Navigation

- [⬅️ Previous: Testing](/doc/08_testing.md)
- [🏠 Main index](../README.md#documentation)