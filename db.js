'use strict';

let _ = require('lodash');
let sqlite3 = require('sqlite3').verbose();

let db = () => {
  let db = null;
  return (fn) => {
    if (!db) {
      db = new sqlite3.Database('db.sqlite', () => fn(db));
    } else {
      fn(db);
    }
  };
}()

module.exports.createOrMigrateBoxDB = (fn) => {
  console.log('db.createOrMigrateBoxDB');
  db((db) => {
    db.run('create table action_queue (serialized text, created_at timestamp DEFAULT CURRENT_TIMESTAMP)', (e) => {
      if (e && e.code === 'SQLITE_ERROR') {
        // table already exists, start migration stuffs
        fn(false);
        return;
      }
      fn(true);
    });
  });
};

module.exports.pushAction = () => {
  let stmt;
  return (action, fn) => {
    db((db) => {
      db.run('insert into action_queue (serialized) values (?)', JSON.stringify(action), () => {
        console.log('done initial serialized');
        fn();
      });
    });
  };
}();

module.exports.getNextActions = (fn) => {
  db((db) => {
    db.all('select rowid, serialized from action_queue order by created_at asc limit 30', (err, actions) => {
      let actionObjects = _.map(actions, (action) => {
        return {
          rowid: action.rowid,
          action: JSON.parse(action.serialized),
        };
      });
      fn(actionObjects);
    });
  });
}

module.exports.deleteAction = () => {
  let stmt;
  return (rowid, fn) => {
    db((db) => {
      db.run('delete from action_queue where rowid = ?', rowid, fn);
    });
  };
}();
