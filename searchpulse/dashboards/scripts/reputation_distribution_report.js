/**
 * Dashboard Report Script: Reputation Score Distribution
 * Scope: x_sp_searchpulse
 *
 * Returns counts of articles in each reputation band for the donut chart.
 */
(function() {
    var bands = [
        { label: 'Highly Trusted (75-100)', filter_low: 75,  filter_high: 100 },
        { label: 'Neutral (50-74)',          filter_low: 50,  filter_high: 74  },
        { label: 'Mildly Demoted (30-49)',   filter_low: 30,  filter_high: 49  },
        { label: 'Heavily Demoted (0-29)',   filter_low: 0,   filter_high: 29  }
    ];

    var segments = [];
    var total    = 0;

    for (var i = 0; i < bands.length; i++) {
        var band = bands[i];

        var gr = new GlideAggregate('u_sp_article_reputation');
        gr.addQuery('reputation_score', '>=', band.filter_low);
        gr.addQuery('reputation_score', '<=', band.filter_high);
        gr.addAggregate('COUNT');
        gr.query();

        var count = gr.next() ? parseInt(gr.getAggregate('COUNT'), 10) : 0;
        total += count;

        segments.push({
            label: band.label,
            count: count
        });
    }

    // Add percentage to each segment
    for (var j = 0; j < segments.length; j++) {
        segments[j].percentage = total > 0
            ? parseFloat(((segments[j].count / total) * 100).toFixed(1))
            : 0;
    }

    data.segments = segments;
    data.total    = total;
})();
