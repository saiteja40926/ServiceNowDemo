/**
 * SearchPulse Agent — Sample Data Seeder
 * Scope: x_sp_searchpulse
 *
 * Run this in: System Definition → Scripts - Background
 * Scope context: x_sp_searchpulse (select scope in the top-right dropdown)
 *
 * This script:
 *   1. Creates sample KB articles (or reuses existing ones)
 *   2. Creates sample search sessions with varied signal patterns
 *   3. Runs the classifier on all sessions
 *   4. Runs the reputation engine to produce scored records
 */

(function seedSearchPulseData() {
    'use strict';

    gs.log('SearchPulse SeedData: starting...', 'SearchPulse');

    // ── 1. Resolve or create sample KB articles ───────────────────────────────

    var articleIds = _ensureArticles([
        {
            short_description: 'Expense Report Submission Guide',
            text: '<p>This guide explains how to submit expense reports through the employee portal. Log into the portal, navigate to Finance > Expense Reports, and click New. Fill in all required fields including date, amount, category, and attach your receipts. Submit for manager approval.</p>',
            number: 'KB0010001'
        },
        {
            short_description: 'VPN Connection Troubleshooting',
            text: '<p>If you cannot connect to the company VPN, try the following steps: 1) Verify your credentials are correct. 2) Restart the VPN client. 3) Check that your system time is synchronized. 4) Contact IT support if the issue persists after these steps.</p>',
            number: 'KB0010002'
        },
        {
            short_description: 'Password Reset Instructions',
            text: '<p>To reset your password, go to the IT Self-Service portal and click Forgot Password. Enter your employee ID and registered email. You will receive a reset link within 5 minutes. If you do not receive the email, check your spam folder or contact the help desk.</p>',
            number: 'KB0010003'
        },
        {
            short_description: 'Remote Work Equipment Request',
            text: '<p>Employees working remotely may request standard equipment including a laptop, monitor, keyboard, and mouse. Submit a hardware request through the IT portal under Service Catalog > Equipment. Allow 5-7 business days for delivery.</p>',
            number: 'KB0010004'
        },
        {
            short_description: 'Annual Leave Policy',
            text: '<p>Full-time employees accrue 15 days of annual leave per year. Leave must be approved by your manager at least one week in advance. Submit leave requests via HR Self-Service. Unused leave up to 5 days can be carried forward to the next year.</p>',
            number: 'KB0010005'
        },
        {
            short_description: 'Software Installation Request',
            text: '<p>Standard software is available via the Software Center on your machine. For non-standard software, raise a Software Installation Request in the IT portal, providing the business justification. Requests are reviewed within 3 business days.</p>',
            number: 'KB0010006'
        },
        {
            short_description: 'Printer Setup Guide',
            text: '<p>To connect to a network printer, open Settings > Devices > Printers. Click Add Printer and allow Windows to discover network printers. Select your floor printer from the list. If the printer does not appear, contact IT support with the printer name.</p>',
            number: 'KB0010007'
        },
        {
            short_description: 'Onboarding Checklist for New Employees',
            text: '<p>Welcome! Please complete the following on your first day: Complete ID badge request, attend orientation session, set up your email and phone, review the employee handbook, and meet with your manager for a 30-day plan discussion.</p>',
            number: 'KB0010008'
        }
    ]);

    gs.log('SearchPulse SeedData: resolved ' + Object.keys(articleIds).length + ' articles', 'SearchPulse');

    // ── 2. Create sample sessions with varied signal patterns ────────────────

    var sessions = [
        // summary_satisfied pattern: thumbs up, no scroll, no click
        { query: 'expense report submission', article: null,     scrolled: false, clicked: null,                     cameBack: false, reformulated: false, feedback: 'up'   },
        { query: 'expense report',            article: null,     scrolled: false, clicked: null,                     cameBack: false, reformulated: false, feedback: 'up'   },
        { query: 'how to submit expenses',    article: null,     scrolled: false, clicked: null,                     cameBack: false, reformulated: false, feedback: 'up'   },

        // drilled_down pattern: scrolled + clicked + no return
        { query: 'vpn not connecting',        article: 'KB0010002', scrolled: true,  clicked: 'KB0010002', cameBack: false, reformulated: false, feedback: 'none' },
        { query: 'expense report guide',      article: 'KB0010001', scrolled: true,  clicked: 'KB0010001', cameBack: false, reformulated: false, feedback: 'none' },
        { query: 'reset password',            article: 'KB0010003', scrolled: true,  clicked: 'KB0010003', cameBack: false, reformulated: false, feedback: 'none' },
        { query: 'expense submission',        article: 'KB0010001', scrolled: true,  clicked: 'KB0010001', cameBack: false, reformulated: false, feedback: 'none' },
        { query: 'remote work equipment',     article: 'KB0010004', scrolled: true,  clicked: 'KB0010004', cameBack: false, reformulated: false, feedback: 'none' },
        { query: 'expense report form',       article: 'KB0010001', scrolled: true,  clicked: 'KB0010001', cameBack: false, reformulated: false, feedback: 'none' },

        // result_failed pattern: clicked + came back
        { query: 'printer setup',             article: 'KB0010007', scrolled: true,  clicked: 'KB0010007', cameBack: true,  reformulated: false, feedback: 'none' },
        { query: 'install software',          article: 'KB0010006', scrolled: true,  clicked: 'KB0010006', cameBack: true,  reformulated: false, feedback: 'none' },
        { query: 'vpn connection issue',      article: 'KB0010002', scrolled: true,  clicked: 'KB0010002', cameBack: true,  reformulated: false, feedback: 'none' },

        // full_failure pattern: reformulated query
        { query: 'leave days',                article: null,        scrolled: false, clicked: null,        cameBack: false, reformulated: true,  feedback: 'none' },
        { query: 'printer not working',       article: null,        scrolled: false, clicked: null,        cameBack: false, reformulated: true,  feedback: 'none' },

        // summary_rejected pattern: thumbs down
        { query: 'onboarding process',        article: null,        scrolled: false, clicked: null,        cameBack: false, reformulated: false, feedback: 'down' },
        { query: 'new employee checklist',    article: null,        scrolled: false, clicked: null,        cameBack: false, reformulated: false, feedback: 'down' },

        // ambiguous pattern
        { query: 'benefits information',      article: null,        scrolled: false, clicked: null,        cameBack: false, reformulated: false, feedback: 'none' },
        { query: 'office location',           article: null,        scrolled: false, clicked: null,        cameBack: false, reformulated: false, feedback: 'none' }
    ];

    var createdSessions = [];

    for (var i = 0; i < sessions.length; i++) {
        var s = sessions[i];
        var sessionSysId = _createSession(s, articleIds);
        if (sessionSysId) {
            createdSessions.push(sessionSysId);
        }
    }

    gs.log('SearchPulse SeedData: created ' + createdSessions.length + ' sessions', 'SearchPulse');

    // ── 3. Classify all sessions ──────────────────────────────────────────────

    var classifier = new x_sp_searchpulse.SearchPulseClassifier();
    var classified  = 0;

    var sessGR = new GlideRecord('u_sp_search_session');
    sessGR.addQuery('outcome_classified', false);
    sessGR.query();

    while (sessGR.next()) {
        classifier.classifySession(sessGR);
        classified++;
    }

    gs.log('SearchPulse SeedData: classified ' + classified + ' sessions', 'SearchPulse');

    // ── 4. Run reputation engine ──────────────────────────────────────────────

    // Inline reputation calculation for seeding (mirrors ReputationJob logic)
    var POSITIVE_WEIGHT = { 'summary_satisfied': 3, 'drilled_down': 2 };
    var NEGATIVE_WEIGHT = { 'summary_rejected': 3, 'result_failed': 2, 'full_failure': 1 };

    var outcomeGR = new GlideRecord('u_sp_search_outcome');
    outcomeGR.addNotNullQuery('impacted_article');
    outcomeGR.addQuery('reputation_applied', false);
    outcomeGR.query();

    var articleOutcomes = {};
    while (outcomeGR.next()) {
        var aid = outcomeGR.getValue('impacted_article');
        var ot  = outcomeGR.getValue('outcome_type');
        if (!articleOutcomes[aid]) { articleOutcomes[aid] = []; }
        articleOutcomes[aid].push(ot);
    }

    var repUpdated = 0;
    for (var artId in articleOutcomes) {
        if (!articleOutcomes.hasOwnProperty(artId)) { continue; }

        var outcomes = articleOutcomes[artId];
        var posDelta = 0, negDelta = 0, posCount = 0, negCount = 0;

        for (var j = 0; j < outcomes.length; j++) {
            var outcome = outcomes[j];
            if (POSITIVE_WEIGHT[outcome]) { posDelta += POSITIVE_WEIGHT[outcome]; posCount++; }
            else if (NEGATIVE_WEIGHT[outcome]) { negDelta += NEGATIVE_WEIGHT[outcome]; negCount++; }
        }

        var repGR2 = new GlideRecord('u_sp_article_reputation');
        repGR2.addQuery('article', artId);
        repGR2.setLimit(1);
        repGR2.query();

        if (repGR2.next()) {
            var cur  = parseInt(repGR2.getValue('reputation_score'), 10) || 50;
            var prev = cur;
            var net  = posDelta - negDelta;
            var ns   = Math.min(100, Math.max(0, cur + net));

            repGR2.setValue('previous_score',    prev);
            repGR2.setValue('reputation_score',  ns);
            repGR2.setValue('positive_sessions', (parseInt(repGR2.getValue('positive_sessions'), 10) || 0) + posCount);
            repGR2.setValue('negative_sessions', (parseInt(repGR2.getValue('negative_sessions'), 10) || 0) + negCount);
            repGR2.setValue('total_sessions',    (parseInt(repGR2.getValue('total_sessions'), 10) || 0) + outcomes.length);
            repGR2.setValue('score_trend',       ns > prev + 2 ? 'rising' : ns < prev - 2 ? 'falling' : 'stable');
            repGR2.setValue('last_calculated',   new GlideDateTime().getValue());
            repGR2.update();
        } else {
            var nr = new GlideRecord('u_sp_article_reputation');
            nr.initialize();
            var ns2 = Math.min(100, Math.max(0, 50 + (posDelta - negDelta)));
            nr.setValue('article',           artId);
            nr.setValue('reputation_score',  ns2);
            nr.setValue('previous_score',    50);
            nr.setValue('positive_sessions', posCount);
            nr.setValue('negative_sessions', negCount);
            nr.setValue('total_sessions',    outcomes.length);
            nr.setValue('score_trend',       ns2 > 52 ? 'rising' : ns2 < 48 ? 'falling' : 'stable');
            nr.setValue('last_calculated',   new GlideDateTime().getValue());
            nr.insert();
        }

        repUpdated++;
    }

    gs.log('SearchPulse SeedData: updated reputation for ' + repUpdated + ' articles', 'SearchPulse');
    gs.log('SearchPulse SeedData: seeding COMPLETE', 'SearchPulse');

    // ── Helper functions ──────────────────────────────────────────────────────

    /**
     * Ensures sample KB articles exist; returns map of number → sys_id
     */
    function _ensureArticles(articleDefs) {
        var idMap = {};

        for (var i = 0; i < articleDefs.length; i++) {
            var def = articleDefs[i];

            var gr = new GlideRecord('kb_knowledge');
            gr.addQuery('number', def.number);
            gr.setLimit(1);
            gr.query();

            if (gr.next()) {
                idMap[def.number] = gr.getUniqueValue();
                gs.log('SearchPulse SeedData: found existing article ' + def.number, 'SearchPulse');
            } else {
                // Attempt to create article (requires KB author or admin role)
                try {
                    var newGR = new GlideRecord('kb_knowledge');
                    newGR.initialize();
                    newGR.setValue('short_description', def.short_description);
                    newGR.setValue('text',              def.text);
                    newGR.setValue('workflow_state',    'published');
                    var newId = newGR.insert();

                    if (newId) {
                        idMap[def.number] = newId;
                        gs.log('SearchPulse SeedData: created article ' + def.number, 'SearchPulse');
                    } else {
                        gs.logWarning('SearchPulse SeedData: could not create article ' + def.number, 'SearchPulse');
                    }
                } catch (e) {
                    gs.logWarning(
                        'SearchPulse SeedData: article creation skipped for ' + def.number +
                        ' (insufficient permissions): ' + e.message,
                        'SearchPulse'
                    );
                }
            }
        }

        return idMap;
    }

    /**
     * Creates a single session record with signals applied.
     *
     * @param {Object}  s          - session definition from the sessions array
     * @param {Object}  articleIds - map of KB number → sys_id
     * @returns {string|null} sys_id of created session
     */
    function _createSession(s, articleIds) {
        var clickedSysId = null;

        if (s.clicked && articleIds[s.clicked]) {
            clickedSysId = articleIds[s.clicked];
        }

        var gr = new GlideRecord('u_sp_search_session');
        gr.initialize();

        gr.setValue('session_id',           gs.generateGUID().replace(/-/g, '').substring(0, 32));
        gr.setValue('query',                s.query);
        gr.setValue('scrolled_to_results',  s.scrolled);
        gr.setValue('came_back_to_search',  s.cameBack);
        gr.setValue('reformulated_query',   s.reformulated);
        gr.setValue('summary_feedback',     s.feedback || 'none');
        gr.setValue('outcome_classified',   false);

        if (clickedSysId) {
            gr.setValue('clicked_article', clickedSysId);
        }

        var gdt = new GlideDateTime();
        // Spread sessions across the past 7 days for realistic data
        gdt.addSeconds(-Math.floor(Math.random() * 604800));
        gr.setValue('created', gdt.getValue());

        var sysId = gr.insert();
        return sysId || null;
    }

})();
