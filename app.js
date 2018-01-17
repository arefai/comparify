/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var client_id = 'd9aa30f3ad93472fbf4b9c689caac41d'; // Your client id
var client_secret = '88de5057b2ad43bfb36db11603f9a7ec'; // Your secret
var redirect_uri = 'http://localhost:8888/callback/'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

app.set('views', __dirname + '/public');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email user-top-read';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

var access_token;
var sum = 0;
var total = 0;
var popularity = 0;
var mostPopularTrackName;
var mostPopularTrackPop = 0;
var mostPopularTrackArtist;

var leastPopularTrackName;
var leastPopularTrackPop = 100;
var leastPopularTrackArtist;

var mostPopularArtist = {
  name: '',
  popularity: 0
}

var leastPopularArtist = {
  name: '',
  popularity: 100
}

var topArtists = [];
var top5tracks = [];
var averageArtistsPop = 0;

var albumCount = {};


function iterateTopTracks(options, res) {
  if (options.url) {
    request.get(options, function(error, response, body) {
        console.log(body);
        for (x in body.items) {
          console.log(body.items[x].popularity);
          sum += body.items[x].popularity;
          total += 1;
          if (body.items[x].album.name in albumCount) {
            albumCount[body.items[x].album.name].count += 1;
          }
          else {
            albumCount[body.items[x].album.name] = {
              album : body.items[x].album.name,
              artist : body.items[x].artists[0].name,
              count : 1
            }
          }
          if (body.items[x].popularity > mostPopularTrackPop) {
            mostPopularTrackName = body.items[x].name;
            mostPopularTrackArtist = body.items[x].artists[0].name;
            mostPopularTrackPop = body.items[x].popularity;
          }

          if (body.items[x].popularity < leastPopularTrackPop) {
            leastPopularTrackName = body.items[x].name;
            leastPopularTrackArtist = body.items[x].artists[0].name;
            leastPopularTrackPop = body.items[x].popularity;
          }

          if (top5tracks.length < 5) {
            top5tracks[top5tracks.length] = body.items[x].name;
          }
        }
        options.url = body.next;
        iterateTopTracks(options, res)
    });
  }
  else {
    popularity =  Math.round(sum / total * 100) / 100;
    var commonAlbum;
    var maxAlbumCount = 0;
    for (key in albumCount) {
      if (albumCount[key].count > maxAlbumCount) {
        commonAlbum = albumCount[key];
        maxAlbumCount = albumCount[key].count;
      }
    }

    var authHead = "Bearer " + access_token;
    var optionsArtist = {
      url: 'https://api.spotify.com/v1/me/top/artists',
      headers: { 'Authorization': authHead },
      json: true
    }

    request.get(optionsArtist, function(error, response, body) {
      topArtists = []
      for (var i = 0; i < 5; i++) {
        topArtists.push(body.items[i].name);
      }

      for (var item in body.items) {
        var pop = body.items[item].popularity;
        if (pop > mostPopularArtist.popularity) {
          mostPopularArtist.name = body.items[item].name;
          mostPopularArtist.popularity = pop;
        }
        if (pop < leastPopularArtist.popularity) {
          leastPopularArtist.name = body.items[item].name;
          leastPopularArtist.popularity = pop;
        }
        averageArtistsPop += body.items[item].popularity;
      }
      averageArtistsPop = Math.round(averageArtistsPop/body.items.length * 100) / 100;

      renderPage(res, commonAlbum);
    });

  }
}

function renderPage(res, commonAlbum) {
  res.render('stat.html', {
      popularity: popularity,
      mostPopularTrack : mostPopularTrackName,
      mostPopularTrackArtist : mostPopularTrackArtist,
      leastPopularTrack : leastPopularTrackName,
      leastPopularTrackArtist : leastPopularTrackArtist,
      mostCommonAlbum : commonAlbum,
      topArtists : topArtists,
      top5tracks: top5tracks,
      averageArtists : averageArtistsPop,
      mostPopularArtist : mostPopularArtist,
      leastPopularArtist : leastPopularArtist
  });
  console.log(topArtists);
    console.log(popularity);
    console.log(top5tracks);
}

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

            access_token = body.access_token,
            refresh_token = body.refresh_token;

        //for (var y = 0; y < 1000; y += 50){
          var options = {
            url: 'https://api.spotify.com/v1/me/top/tracks',
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
          };

          iterateTopTracks(options, res);
        // we can also pass the token to the browser to make requests from there

        // res.redirect('/#' +
        //   querystring.stringify({
        //     access_token: access_token,
        //     refresh_token: refresh_token
        //   }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);
