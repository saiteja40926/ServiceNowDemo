(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {

    var body = request.body.data;

    // ── Input validation ────────────────────────────────────────────────────
    if (!body || !body.session_id) {
        response.setStatus(400);
        response.setBody({ error: 'Missing required field: session_id' });
        return;
    }

    var sessionId       = body.session_id;
    var durationSeconds = body.duration_seconds || 0;

    // ── Fetch session ────────────────────────────────────────────────────────
    var gr = new GlideRecord('u_sp_search_session');
    gr.addQuery('session_id', sessionId);
    gr.setLimit(1);
    gr.query();

    if (!gr.next()) {
        response.setStatus(404);
        response.setBody({ error: 'Session not found: ' + sessionId });
        return;
    }

    // ── Guard: already classified ────────────────────────────────────────────
    if (gr.getValue('outcome_classified') === '1') {
        var existingOutcome = _getExistingOutcome(gr.getUniqueValue());
        response.setStatus(200);
        response.setBody({
            session_id: sessionId,
            outcome:    existingOutcome,
            status:     'already_classified'
        });
        return;
    }

    // ── Record duration ──────────────────────────────────────────────────────
    if (durationSeconds > 0) {
        gr.setValue('session_duration_seconds', durationSeconds);
        gr.update();
    }

    // ── Classify session ─────────────────────────────────────────────────────
    var classifier = new SearchPulseClassifier();
    var outcome    = classifier.classifySession(gr);

    gs.log(
        'SearchPulse: session=' + sessionId + ' ended, outcome=' + outcome,
        'SearchPulse'
    );

    response.setStatus(200);
    response.setBody({
        session_id: sessionId,
        outcome:    outcome,
        status:     'classified'
    });

    // ── Helper ────────────────────────────────────────────────────────────────
    function _getExistingOutcome(sessionSysId) {
        var outcomeGR = new GlideRecord('u_sp_search_outcome');
        outcomeGR.addQuery('session', sessionSysId);
        outcomeGR.orderByDesc('created');
        outcomeGR.setLimit(1);
        outcomeGR.query();
        return outcomeGR.next() ? outcomeGR.getValue('outcome_type') : 'unknown';
    }

})(request, response);
