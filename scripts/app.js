'use strict';
var app = angular.module("ftpsyncApp", ['ngRoute']);

app.config(['$routeProvider', '$locationProvider', function($routeProvider) {
  $routeProvider.when('/', {
    title: 'Home', 
    templateUrl: 'partials/home.html',
    controller: 'HomeCtrl',
  });
  $routeProvider.when('/getting-started', {
    title: 'Getting Started', 
    templateUrl: 'partials/start.html',
    controller: 'StartCtrl',
  });
  $routeProvider.when('/cli-documentation', {
    title: "CLI Documentation",
    templateUrl: 'partials/cli.html',
    controller: 'CliCtrl',
  });
  $routeProvider.when('/api-documentation', {
    title: 'API Documentation',
    templateUrl: 'partials/api.html',
    controller: 'ApiCtrl',
  });
  $routeProvider.otherwise('/');
}]);

// run blocks
app.run(['$rootScope', function($rootScope) {
  $rootScope.$on("$routeChangeSuccess", function(event, current, previous) {
    $rootScope.title = 'Node-FtpSync - ' + current.title;
  });
}]);

app.controller('HomeCtrl', ['$scope', function($scope){
    $scope.message = 'Home Page';
}]);

app.controller('StartCtrl', ['$scope', function($scope){
    $scope.message = 'Getting Started';
}]);

app.controller('CliCtrl', ['$scope', function($scope) {
    $scope.message = 'CLI Documentation';
}]);

app.controller('ApiCtrl', ['$scope', function($scope) {
    $scope.message = 'API Documentation';
}]);