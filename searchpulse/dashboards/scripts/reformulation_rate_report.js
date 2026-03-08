/**
 * Dashboard Report Script: Query Reformulation Rate
 * Scope: x_sp_searchpulse
 *
 * Returns percentage of sessions in the last 30 days where the user
 * had to reformulate their query (signal of search failure).
 */
(function() {
    var cutoff = new GlideDateTime();
    cutoff.addSeconds(-2592000); // 30 days

    var totalGR = new GlideAggregate('u_sp_search_session');
    totalGR.addQuery('created', '>=', cutoff.getValue());
    totalGR.addAggregate('COUNT');
    totalGR.query();
    var total = totalGR.next() ? parseInt(totalGR.getAggregate('COUNT'), 10) : 0;

    if (total === 0) {
        data.rate  = 0;
        data.total = 0;
        data.count = 0;
        return;
    }

    var reformulatedGR = new GlideAggregate('u_sp_search_session');
    reformulatedGR.addQuery('created', '>=', cutoff.getValue());
    reformulatedGR.addQuery('reformulated_query', true);
    reformulatedGR.addAggregate('COUNT');
    reformulatedGR.query();
    var reformulated = reformulatedGR.next() ? parseInt(reformulatedGR.getAggregate('COUNT'), 10) : 0;

    data.rate  = parseFloat(((reformulated / total) * 100).toFixed(1));
    data.total = total;
    data.count = reformulated;
})();
