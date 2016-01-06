var config = require('./common/config');
var constructPlugin = require('./lib/constructPlugin');
var debug = require('debug')('gitevents');
var talks = require('./lib/talks');
var events = require('./lib/events');
var gitWebhook = require('github-webhook-handler');
var express = require('express');
var cors = require('cors');
var rollbar = require('rollbar');
rollbar.init(config.rollbar);

var tito = constructPlugin('gitevents-tito');

var app = express();

app.set('port', process.env.PORT || 3000);

app.use(cors());

if (!config || !config.github) {
  process.exit(-1);
}

var hookHandler = gitWebhook({
  path: '/github/delivery',
  secret: config.github.secret
});

hookHandler.on('error', function(err) {
  console.log(err);
});

hookHandler.on('issues', function(event) {
  debug('New event: ' + event.event);

  if (event.payload) {
    var payload = event.payload;

    if (payload.action === 'labeled') {
      debug('label: ' + payload.label.name);

      var labels = [];

      if (payload.labels) {
        labels = payload.labels.map(function(label) {
          return label.name;
        });
      } else {
        labels = payload.label.name;
      }
      payload.labelMap = labels;

      if (labels.indexOf(config.labels.proposal) > -1) {
        debug('New talk proposal. Nothing to do yet');
      }

      // Chain for planning events
      if (labels.indexOf(config.labels.event) > -1) {
        debug('New event planning.');

        if (tito) {
          console.log('tito ahoy');
          tito(config.plugins[tito], payload);
        }

        // events(payload).then(function(event) {
        //   // !! add event-related plugins here, for example tito !!
        // }).catch(function(error) {
        //   rollbar.handleError(error);
        // });
      }

      // Chain for talks
      //TODO: 'talk proposal' contains 'talk', so this should be refactored. Going with 'proposal' for now.
      if (labels.indexOf(config.labels.talk) > -1) {
        debug('New talk: ' + payload.issue.title);

        events(payload).then(function(event) {
          talks(payload, event).then(function(talk) {
            console.log(talk);
            console.log('talk processed.');
          });
        }).catch(function(error) {
          console.log('error');
          console.log(error);
          rollbar.handleError(error);
        });
      }
    }
  } else {
    debug('no action recognised.', event);
  }
});

app.post('/github/delivery', function(req, res) {
  hookHandler(req, res, function() {
    res.status(404).send();
  });
});

var server = app.listen(app.get('port'), function() {
  debug('gitevents server listening on port ' + server.address().port);
});
