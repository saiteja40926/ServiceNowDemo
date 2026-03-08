(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {

    var body = request.body.data;

    // ── Input validation ────────────────────────────────────────────────────
    if (!body || !body.session_id || !body.signal_type) {
        response.setStatus(400);
        response.setBody({ error: 'Missing required fields: session_id, signal_type' });
        return;
    }

    var sessionId  = body.session_id;
    var signalType = body.signal_type;
    var articleId  = body.article || null;

    // Allowed signal types
    var validSignals = [
        'summary_thumbs_up',
        'summary_thumbs_down',
        'scroll_to_results',
        'result_click',
        'return_to_search',
        'query_reformulation'
    ];

    if (validSignals.indexOf(signalType) === -1) {
        response.setStatus(400);
        response.setBody({
            error: 'Invalid signal_type. Allowed values: ' + validSignals.join(', ')
        });
        return;
    }

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

    // ── Apply signal to session fields ───────────────────────────────────────
    var updated = false;

    switch (signalType) {

        case 'summary_thumbs_up':
            if (gr.getValue('summary_feedback') === 'none') {
                gr.setValue('summary_feedback', 'up');
                updated = true;
            }
            break;

        case 'summary_thumbs_down':
            if (gr.getValue('summary_feedback') === 'none') {
                gr.setValue('summary_feedback', 'down');
                updated = true;
            }
            break;

        case 'scroll_to_results':
            if (gr.getValue('scrolled_to_results') !== '1') {
                gr.setValue('scrolled_to_results', true);
                updated = true;
            }
            break;

        case 'result_click':
            // Only record the first click
            if (!gr.getValue('clicked_article') && articleId) {
                var articleGR = new GlideRecord('kb_knowledge');
                if (articleGR.get(articleId)) {
                    gr.setValue('clicked_article', articleId);
                    updated = true;
                } else {
                    gs.logWarning(
                        'SearchPulse: result_click received unknown article sys_id=' + articleId,
                        'SearchPulse'
                    );
                }
            }
            break;

        case 'return_to_search':
            if (gr.getValue('came_back_to_search') !== '1') {
                gr.setValue('came_back_to_search', true);
                updated = true;
            }
            break;

        case 'query_reformulation':
            if (gr.getValue('reformulated_query') !== '1') {
                gr.setValue('reformulated_query', true);
                updated = true;
            }
            break;
    }

    if (updated) {
        gr.update();
        gs.log(
            'SearchPulse: signal=' + signalType + ' applied to session=' + sessionId,
            'SearchPulse'
        );
    }

    response.setStatus(200);
    response.setBody({
        session_id:  sessionId,
        signal_type: signalType,
        status:      updated ? 'recorded' : 'no_change'
    });

})(request, response);
