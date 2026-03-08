# SearchPulse Agent — ServiceNow Application

## Overview

SearchPulse Agent is a scoped ServiceNow application that improves Enterprise Search results by tracking user search behavior and automatically adjusting article reputation and ranking.

**Application Scope:** `x_sp_searchpulse`

---

## Architecture

```
User Search Session
       ↓
Client Signal Capture (Portal Widget JS)
       ↓
Scripted REST API  →  u_sp_search_session
       ↓
SearchPulseClassifier  →  u_sp_search_outcome
       ↓
SearchPulseReputationJob (Nightly)  →  u_sp_article_reputation
       ↓
SearchPulseRankingEngine  →  Re-ranked Search Results
       ↓
SearchPulseBadgeService  →  Trust Badges in Portal UI
```

---

## Repository Structure

```
/searchpulse
├── tables/
│   ├── u_sp_search_session.json
│   ├── u_sp_search_outcome.json
│   └── u_sp_article_reputation.json
├── script_includes/
│   ├── SearchPulseClassifier.js
│   ├── SearchPulseRankingEngine.js
│   └── SearchPulseBadgeService.js
├── rest_apis/
│   ├── SearchPulseSessionAPI.json
│   └── endpoints/
│       ├── session_start.js
│       ├── session_signal.js
│       └── session_end.js
├── scheduled_jobs/
│   └── SearchPulseReputationJob.js
├── portal_widgets/
│   ├── searchpulse-search-widget/
│   │   ├── widget.json
│   │   ├── client_script.js
│   │   ├── server_script.js
│   │   ├── template.html
│   │   └── style.scss
│   └── searchpulse-badge-widget/
│       ├── widget.json
│       ├── client_script.js
│       ├── server_script.js
│       ├── template.html
│       └── style.scss
├── dashboards/
│   └── searchpulse_analytics_dashboard.json
├── test_data/
│   └── sample_data.js
└── README.md
```

---

## Setup Instructions

### Prerequisites

- ServiceNow instance (Tokyo or later recommended)
- Admin access to create scoped applications
- Git integration enabled (Application Repository plugin)

### Step 1: Create Scoped Application

1. Navigate to **System Applications → Studio**
2. Click **Create Application**
3. Set Name: `SearchPulse Agent`
4. Set Scope: `x_sp_searchpulse`
5. Click **Create**

### Step 2: Import via Source Control

1. In Studio, click **Source Control → Import from Source Control**
2. Enter your Git repository URL
3. Authenticate and select branch `main`
4. Click **Import**

### Step 3: Create Tables

Apply each table definition from `/tables/` in this order:

1. `u_sp_search_session`
2. `u_sp_search_outcome`
3. `u_sp_article_reputation`

Navigate to **System Definition → Tables** and create each table using the JSON definitions as reference.

### Step 4: Deploy Script Includes

Navigate to **System Definition → Script Includes** and create:

1. `SearchPulseClassifier`
2. `SearchPulseRankingEngine`
3. `SearchPulseBadgeService`

Paste the corresponding JS file content for each.

### Step 5: Deploy REST API

1. Navigate to **System Web Services → Scripted REST APIs**
2. Create API: `SearchPulse Session API` with base path `/x_sp_searchpulse`
3. Add three resources from `/rest_apis/endpoints/`

### Step 6: Activate Scheduled Job

1. Navigate to **System Definition → Scheduled Jobs**
2. Import `SearchPulseReputationJob`
3. Set schedule to **Daily at 02:00**

### Step 7: Deploy Portal Widgets

1. Navigate to **Service Portal → Widgets**
2. Create widgets from `/portal_widgets/` directory
3. Add `searchpulse-search-widget` to your search page
4. Enable badge display in search results

### Step 8: Import Test Data

Run the script in `/test_data/sample_data.js` via **System Definition → Scripts - Background** to seed sample data.

---

## API Reference

### POST /api/x_sp_searchpulse/session/start

Creates a new search session.

**Request:**
```json
{
  "query": "expense report submission",
  "user_sys_id": "abc123def456"
}
```

**Response:**
```json
{
  "session_id": "uuid-here",
  "status": "created"
}
```

---

### POST /api/x_sp_searchpulse/session/signal

Records a user signal event.

**Request:**
```json
{
  "session_id": "uuid-here",
  "signal_type": "result_click",
  "article": "kb_article_sys_id"
}
```

**Signal Types:** `summary_thumbs_up`, `summary_thumbs_down`, `scroll_to_results`, `result_click`, `return_to_search`, `query_reformulation`

**Response:**
```json
{
  "status": "recorded"
}
```

---

### POST /api/x_sp_searchpulse/session/end

Finalizes session, triggers classification.

**Request:**
```json
{
  "session_id": "uuid-here"
}
```

**Response:**
```json
{
  "session_id": "uuid-here",
  "outcome": "drilled_down",
  "status": "classified"
}
```

---

## Reputation Score Bands

| Score Range | Multiplier | Badge |
|-------------|-----------|-------|
| 75 – 100 | 1.2x | ✓ Frequently Helpful |
| 50 – 74 | 1.0x | (none) |
| 30 – 49 | 0.8x | ⚠ May Be Outdated (if >6 months old) |
| 0 – 29 | 0.5x | (demoted) |

---

## Session Outcome Classifications

| Outcome | Condition |
|---------|-----------|
| `summary_satisfied` | Thumbs up, no scroll, no click |
| `drilled_down` | Scrolled + clicked + no return |
| `result_failed` | Clicked + returned to search |
| `full_failure` | Query reformulated |
| `summary_rejected` | Thumbs down |
| `ambiguous` | None of the above |

---

## Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| SearchPulseReputationJob | Daily 02:00 | Recalculate all article reputation scores |

---

## Support

For issues, check the ServiceNow system log filtered by source `SearchPulse`.
