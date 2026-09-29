// Karma setup for `ng test`: Jasmine in Chrome, per-test output (spec reporter) and coverage.
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('karma-spec-reporter'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: { jasmine: { random: true }, clearContext: false },
    reporters: ['spec'],
    specReporter: { suppressSkipped: true, showSpecTiming: false },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [{ type: 'text-summary' }, { type: 'html' }, { type: 'json-summary' }],
    },
    browsers: ['ChromeHeadless'],
    restartOnFileChange: true,
  });
};
