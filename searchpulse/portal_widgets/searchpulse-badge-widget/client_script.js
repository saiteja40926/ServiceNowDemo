/**
 * SearchPulse Badge Widget — Client Controller
 * Scope: x_sp_searchpulse
 */
function SearchPulseBadgeCtrl($scope) {
    'use strict';

    var c = this;

    c.badge           = $scope.data.badge          || { show: false };
    c.reputationScore = $scope.data.reputationScore || 50;
    c.trend           = $scope.data.trend           || 'stable';

    c.getIconClass = function() {
        var iconMap = {
            'check-circle':   'fa-check-circle',
            'refresh':        'fa-refresh',
            'alert-triangle': 'fa-exclamation-triangle'
        };
        return iconMap[c.badge.icon] || 'fa-tag';
    };
}
