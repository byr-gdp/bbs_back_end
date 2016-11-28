'use strict';
var restify = require('restify');
var fetch = require('node-fetch');
var redis = require('redis');
var moment = require('moment-timezone');

var client = redis.createClient();
var expire_time = 60 * 60 * 24;

// if you'd like to select database 3, instead of 0 (default), call
// client.select(3, function() { /* ... */ });

client.on('error', function (err) {
    console.log('Error ' + err);
});

var server = restify.createServer();

//support cors
server.use(restify.CORS());

//test
// server.get('/hello/:name', respond);
// server.head('/hello/:name', respond);
// server.get('/redis/:name', test_redis);

server.get('/newvisitor', function(req, res){
  var now = moment().tz('Asia/Shanghai').format().slice(0, 10);
  client.incr(now, function(err, reply){
    if(err){
      return;
    }
    res.send(200, reply);
  });
});

//返回指定日期 commits list
server.get('/commits/:date', function(req, res){
  var date = req.params.date;
  console.log('date input:' + date);
  console.log('new date:' + new Date(date));
  var redis_key = `commits:${date}`;
  console.time('fetch_time');
  client.get(redis_key, function(err, reply){
    if(err){
      console.log('Error: ' + err + '\n');
      return false;
    }
    //redis is null
    if(!reply){
      console.log('not found the key');
      var d = new Date(date);
      var until_prefix = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() - 1);
      var since_prefix = d.toISOString().slice(0, 10);
      var since_timestamp = since_prefix + 'T17:05:000Z';
      var until_timestamp = until_prefix + 'T15:50:000Z';
      var fetch_url = `https://api.github.com/repos/byr-gdp/bbs_hot_topics_review/` +
                      `commits?since=${since_timestamp}&until=${until_timestamp}`;
      fetch(fetch_url)
      .then(function(response){
        return response.json();
      }).then(function(json){
        client.set(redis_key, JSON.stringify(json), redis.print);
        client.expire(redis_key, expire_time);
        console.timeEnd('fetch_time');
        res.send(json);
      }).catch(function(ex){
        console.log('parsing failed', ex);
      });
    }else{
      client.ttl(redis_key, function(err, data){
        console.log('found the key & ttl:' + data);
      });
      console.timeEnd('fetch_time');
      res.send(JSON.parse(reply));
    }
  });
});

//返回某次 commit 对应日期的 data.json
server.get('/commits/:date/:sha', function(req, res){
  // var date = req.params.date;
  var sha = req.params.sha;
  var redis_key = `commit:${sha}`;
  console.time('fetch_time');
  client.get(redis_key, function(err, reply){
    if(err){
      console.log('Error: ' + err + '\n');
      return false;
    }
    //redis is null
    if(!reply){
      console.log('not found the key');
      var fetch_url = `https://raw.githubusercontent.com/byr-gdp/bbs_hot_topics_review/` +
                      `${req.params.sha}/data/${req.params.date}.json`;
      console.log(fetch_url);
      fetch(fetch_url)
      .then(function(response){
        return response.json();
      }).then(function(json){
        client.set(redis_key, JSON.stringify(json), redis.print);
        client.expire(redis_key, expire_time);
        console.timeEnd('fetch_time');
        res.send(json);
      }).catch(function(ex){
        console.log('parsing failed', ex);
      });
    }else{
      client.ttl(redis_key, function(err, data){
        console.log('found the key & ttl:' + data);
      });
      console.timeEnd('fetch_time');
      res.send(JSON.parse(reply));
    }
  });

});

server.listen(8082, function() {
  console.log('%s listening at %s', server.name, server.url);
});
