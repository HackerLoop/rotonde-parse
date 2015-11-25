'use strict';

let _ = require('lodash');
let isOnline = require('is-online');
let Parse = require('parse/node').Parse;
let newClient = require('rotonde-client');
let storage = require('node-persist');
storage.initSync();

let db = require('./db');

let canSend = () => online && parseUser && parseDevice;

let online = false;

let parseUser;
let parseDevice;
let parseDeviceIdentifier = storage.getItemSync('parseDeviceIdentifier');

let initParse = () => {
  Parse.initialize('Rb9d6bBDDlGMPwhF48pts7es7uuYFjJXyADXehED', 'PCa22r7S4rtvMNEJgK02eb8rSzbeAa21Q38meLYD');
  if (!online || canSend())
    return;
  Parse.User.logIn('Zenith', 'Zenith').then((user) => {
    parseUser = user;
    let Device = Parse.Object.extend('Device');
    if (!parseDeviceIdentifier) {
      let device = new Device();
      device.setACL(new Parse.ACL(user));
      device.save().then((device) => {
        parseDeviceIdentifier = device.id;
        storage.setItemSync('parseDeviceIdentifier', parseDeviceIdentifier);
      });
    } else {
      let query = new Parse.Query(Device);
      query.get(parseDeviceIdentifier).then((device) => {
        parseDevice = device;
      });
    }
  });
}

let sendTask = () => {
  let started = false;
  return () => {
    if (started) {
      return;
    }
    started = true;

    let task = () => {
      db.getNextActions((actions) => {
        let promises = [];
        _.forEach(actions, (action) => {
          console.log(action);
          let Class = new Parse.Object.extend(action.action.data.class);
          let o = new Class();

          _.forEach(_.keys(action.action.data.object), (field) => {
            o.set(field, action.action.data.object[field]);
          });

          promises.push(o.save().then((resp) => {
            client.sendEvent('PARSE_REQUEST_RETURN', {
              reqname: action.action.data.reqname,
              object: resp,
            });
            db.deleteAction(action.rowid, () => {});
          }));
        });

        Parse.Promise.when(promises).then(() => {
          setTimeout(task, 1000);
        });
      });
    };
    task();
  };
}();

/**
 * Action processing
 */

let processAction = (action) => {
  db.pushAction(action, () => {
    console.log('pushed action', action);
  });
};

// rotonde client

let client = newClient('ws://127.0.0.1:4224/');

client.onReady(() => {
  console.log('client.onReady');
  db.createOrMigrateBoxDB((first) => {
    console.log(first ? 'done db init' : 'done db migration');
  });
  isOnline((err, o) => {
    online = o;
    console.log(online);
    if (online) {
      initParse();
      sendTask();
    }
  });
});

/**
 * event definitions
 */

client.addLocalDefinition('event', 'PARSE_REQUEST_RETURN', [
  {
    name: 'reqname',
    type: 'string',
    unit: '',
  },
  {
    name: 'object',
    type: 'object',
    unit: '',
  },
]);

/**
 * action definitions
 */

let fields = [
  {
    name: 'reqname',
    type: 'string',
    unit: '',
  },
  {
    name: 'class',
    type: 'string',
    unit: '',
  },
  {
    name: 'object',
    type: 'object',
    unit: '',
  },
];

client.addLocalDefinition('action', 'PARSE_ADD', fields);
client.actionHandlers.attach('PARSE_ADD', processAction);

client.addLocalDefinition('action', 'PARSE_DEL', fields);
client.actionHandlers.attach('PARSE_DEL', processAction)

client.addLocalDefinition('action', 'PARSE_GET', fields);
client.actionHandlers.attach('PARSE_GET', processAction)

client.connect();
