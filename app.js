'use strict';
var app = angular.module("myApp", ['ngRoute']);

app.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
  $routeProvider.when('/', {
    templateUrl: 'partials/home.html',
    controller: 'HomeCtrl'
  });
  $routeProvider.when('/services', {
    templateUrl: 'partials/services.html',
    controller: 'ServicesCtrl'
  });
  $routeProvider.when('/clients', {
    templateUrl: 'partials/clients.html',
    controller: 'ClientsCtrl'
  });
  $routeProvider.otherwise('/');
  $locationProvider.html5Mode(true);
}]);

app.controller('HomeCtrl', ['$scope', function($scope){
    $scope.message = 'Welcome to Inspire';
}]);

app.controller('ServicesCtrl', ['$scope', function($scope) {
    $scope.message = 'Everyone come and see how good I look!';
}]);

app.controller('ClientsCtrl', ['$scope', function($scope) {
    $scope.message = 'These are clients';
}]);