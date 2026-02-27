# Trust Search Engine — ServiceNow Service Portal

A behavior-driven, self-learning search engine built entirely inside a ServiceNow scoped app.
No LLM. No external dependencies. Purely signal-based re-ranking.

---

## Architecture

```
User types query
      │
      ▼
Service Portal Widget  (sp_widget: trust-search-engine)
      │  calls
      ▼
Scripted REST API  GET /api/x_snc_demo_scope_0/trust_search/search?q=<query>
      │
      ├─► TrustSearchIndexer.searchRaw()   — TF-IDF scoring over x_snc_demo_scope_0_search_index
      │
      └─► TrustReRanker.reRank()           — blends TF-IDF + CTR + Dwell + Bounce signals
                                           — persists updated trust_score back to index
User sees results with trust badges
      │
      ▼
User clicks a result  → POST /behavior  { event_type: "click" }
User stays 30s        → POST /behavior  { event_type: "dwell", dwell_seconds: 30 }
User bounces back     → POST /behavior  { event_type: "bounce" }
      │
      ▼
TrustBehaviorTracker updates counters on x_snc_demo_scope_0_search_index
      │
      ▼
Next search → re-ranked automatically with updated trust signals
```

---

## Tables Created

| Table | Purpose |
|-------|---------|
| `x_snc_demo_scope_0_search_index` | Stores indexed records with TF-IDF vectors and trust counters |
| `x_snc_demo_scope_0_search_behavior` | Audit log of every behavior event |

### search_index fields
- `source_table`, `source_sys_id` — origin record
- `title`, `body_snippet` — display content
- `tf_vector` — JSON TF-IDF map (token → weight)
- `trust_score` — running trust score (0.0–1.0)
- `click_count`, `impression_count`, `bounce_count`, `avg_dwell_seconds` — raw signals
- `category` — kb / incident / catalog / problem

---

## Script Includes

| Class | Role |
|-------|------|
| `TrustSearchIndexer` | Tokenizes text, computes TF-IDF, upserts index records |
| `TrustBehaviorTracker` | Records click / dwell / bounce events, updates counters |
| `TrustReRanker` | Computes composite trust score, blends with TF-IDF, returns ranked list |
| `TrustSearchAdmin` | Bulk-indexes KB articles, incidents, catalog items, problems |

### Re-Ranking Formula

```
final_score = tfidf_norm × 0.40
            + ctr_score  × 0.25
            + dwell_score× 0.20
            + bounce_score×0.10
            + stored_trust×0.05
```

**Trust Labels:**
- 🟢 **High** — score ≥ 80%
- 🟡 **Medium** — score 55–79%
- 🔴 **Low** — score < 55%

---

## Deployment Steps

### 1. Commit & push to your ServiceNow source control branch

```bash
git add .
git commit -m "feat: Trust Search Engine - behavior-driven re-ranking"
git push
```

### 2. Apply the update set in ServiceNow

**System Update Sets → Retrieved Update Sets → Import from Source Control**
or apply via XML import.

### 3. Seed the search index (run once as admin)

Navigate to **System Definition → Scripts - Background**, switch scope to `Demo scoped app`, and run:

```javascript
var admin = new x_snc_demo_scope_0.TrustSearchAdmin();
var stats = admin.seedDefaultTables();
gs.log(JSON.stringify(stats));
```

This indexes published KB articles, resolved incidents, active catalog items, and fixed problems.

### 4. Index custom tables (optional)

```javascript
var admin = new x_snc_demo_scope_0.TrustSearchAdmin();
admin.indexCustomTable(
    'x_snc_demo_scope_0_demo_scoped_table',  // your table
    'name',           // title field
    'description',    // body field
    'custom',         // category label
    200               // limit
);
```

### 5. Open the Service Portal page

```
https://<your-instance>.service-now.com/sp?id=trust_search
```

---

## How Learning Works

1. **First search** — results ranked purely by TF-IDF (relevance to query tokens).
2. **User clicks** → `click_count++`, timestamp recorded.
3. **8 seconds after click:**
   - If user returned in < 3s → `bounce_count++` (result was not useful)
   - Otherwise → `avg_dwell_seconds` updated (result was useful)
4. **Every impression** → `impression_count++` per shown result.
5. **Next search for same query** — TrustReRanker reads updated counters, recalculates trust score, re-ranks results. The previously-bounced result drops; the well-dwelled result rises.

---

## REST API Reference

### Search
```
GET /api/x_snc_demo_scope_0/trust_search/search?q=<query>&limit=15
```
Response:
```json
{
  "query": "vpn setup",
  "total": 5,
  "results": [
    {
      "sys_id": "...",
      "title": "How to configure VPN",
      "body_snippet": "...",
      "category": "kb",
      "trust_label": "high",
      "computed_trust": 0.87,
      "final_score": 0.72,
      "trust_signals": {
        "ctr": 0.9, "dwell": 0.75, "bounce": 0.8,
        "impressions": 42, "clicks": 38, "avg_dwell_seconds": 95
      }
    }
  ]
}
```

### Track Behavior
```
POST /api/x_snc_demo_scope_0/trust_search/behavior
{ "event_type": "click",  "query": "vpn", "index_sys_id": "...", "rank_position": 1 }
{ "event_type": "dwell",  "query": "vpn", "index_sys_id": "...", "dwell_seconds": 45 }
{ "event_type": "bounce", "query": "vpn", "index_sys_id": "..." }
```

---

## Monitoring

Check index stats at any time:
```javascript
var admin = new x_snc_demo_scope_0.TrustSearchAdmin();
gs.log(JSON.stringify(admin.getIndexStats()));
// → { "total_indexed": 312, "by_category": {"kb":150,"incident":100,...}, "high_trust_count": 48 }
```

Full rebuild (clears + re-seeds):
```javascript
admin.rebuildIndex();
```
