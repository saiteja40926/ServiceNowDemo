(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {

    var body = request.body.data;

    // ── Input validation ────────────────────────────────────────────────────
    if (!body || !body.query) {
        response.setStatus(400);
        response.setBody({ error: 'Missing required field: query' });
        return;
    }

    var query      = body.query;
    var userSysId  = body.user_sys_id || null;
    var sessionId  = body.session_id  || _generateSessionId();

    // ── Guard: prevent duplicate session creation ───────────────────────────
    var existing = new GlideRecord('u_sp_search_session');
    existing.addQuery('session_id', sessionId);
    existing.setLimit(1);
    existing.query();

    if (existing.next()) {
        response.setStatus(200);
        response.setBody({
            session_id: sessionId,
            status:     'already_exists'
        });
        return;
    }

    // ── Create session record ────────────────────────────────────────────────
    var gr = new GlideRecord('u_sp_search_session');
    gr.initialize();

    gr.setValue('session_id',           sessionId);
    gr.setValue('query',                query);
    gr.setValue('scrolled_to_results',  false);
    gr.setValue('came_back_to_search',  false);
    gr.setValue('reformulated_query',   false);
    gr.setValue('summary_feedback',     'none');
    gr.setValue('outcome_classified',   false);
    gr.setValue('session_duration_seconds', 0);

    if (userSysId) {
        var userGR = new GlideRecord('sys_user');
        if (userGR.get(userSysId)) {
            gr.setValue('user', userSysId);
        }
    }

    var sysdateTime = new GlideDateTime();
    gr.setValue('created', sysdateTime.getValue());

    var newSysId = gr.insert();

    if (!newSysId) {
        gs.logError('SearchPulse: Failed to insert session record for query: ' + query, 'SearchPulse');
        response.setStatus(500);
        response.setBody({ error: 'Failed to create session' });
        return;
    }

    gs.log('SearchPulse: Session started id=' + sessionId + ' query=' + query, 'SearchPulse');

    response.setStatus(201);
    response.setBody({
        session_id: sessionId,
        sys_id:     newSysId,
        status:     'created'
    });

    // ── Helper: UUID-style session ID ────────────────────────────────────────
    function _generateSessionId() {
        return gs.generateGUID().replace(/-/g, '').toLowerCase().substring(0, 32);
    }

})(request, response);
