let defaultMaskRadius = 125; // size of the viewing circle
let guessSeconds = 60; // seconds to guess before the reveal
let votePrefix = "!guess "; // chat message prefix needed to register guess
let circlePaddingX = 315; // margin left and right where the viewing circle won't be placed
let circlePaddingY = 15; // marging top and bottom where the viewing circle won't be placed
let pointsCorrect = 10; // points awarded for a correct guess
let pointsIncorrect = -15; // points awarded for an incorrect guess
let videoUrlPrefix = "https://livestreamfails-video-prod.b-cdn.net/video/"; // video url without the video id

let videoPlayer;
let streamerClips = [];
let viewingCircle;
let viewingCircleOutline;
let totalScores = {};
let guesses = {};
let currentStreamer = '';
let streamerNameCache = {};
let twitchBearerToken;
let twitchClientId;

function loop() {
    start();

    setTimeout(() => {
        end();

        setTimeout(() => {
            loop();
        }, 1000 * 10);
    }, 1000 * guessSeconds);
}

function start() {
    guesses = {};
    $('.streamer-name').hide();
    drawRandomMask();
    playRandomClip();
    startTimer();
}

function end() {
    reveal();
    awardPoints();
    renderLeaderboard();
}

/*
    Uses 'guesses' to add points to 'totalScores' for each user
*/
function awardPoints() {
    let currentStreamerLower = currentStreamer.toLowerCase();
    for (user in guesses) {
        if (!(user in totalScores)) {
            totalScores[user] = 0
        }
        if (guesses[user].toLowerCase() == currentStreamerLower) {
            totalScores[user] += pointsCorrect;
        } else {
            totalScores[user] += pointsIncorrect;
        }
    };
}

/*
    Shows the top ten users from 'totalScores' on the leaderboard
*/
function renderLeaderboard() {
    let $leaderboard = $('.leaderboard table');
    $leaderboard.children('tr').remove();

    let sortable = [];
    for (user in totalScores) {
        sortable.push([user, totalScores[user]]);
    }

    sortable.sort((a, b) => {
        return b[1] - a[1];
    });
    let results = sortable.slice(0, 10);

    for (let i = 0; i < results.length; i++) {
        $leaderboard.append(`<tr><td>${i + 1}</td><td class='user'>${results[i][0]}</td><td>${results[i][1]}</td></tr>`);
    }
}

/*
    Loads the top 100 clips from livestreamfails.com into 'streamerClips'
*/
function loadClips(initial = false) {
    let newStreamerClips = [];
    let calls = 4;
    let urlPart = 'https://api.livestreamfails.com/clips?querySort=new&queryMinScore=500';
    let load = function (initial, callsLeft, lastId) {
        url = urlPart;
        if (lastId > 0) {
            url = urlPart + '&queryAfter=' + lastId;
        }
        $.ajax({
            url: url,
            success: function (data) {
                newStreamerClips = newStreamerClips.concat(data.filter(clip => {
                    return clip.sourcePlatform == 'TWITCH' && clip.isNSFW == false
                }));
                if (callsLeft <= 0) {
                    streamerClips = newStreamerClips;
                }
                if (callsLeft <= 0 && initial) {
                    loop();
                } else if (callsLeft > 0) {
                    load(initial, callsLeft - 1, newStreamerClips[newStreamerClips.length - 1].id);
                }
            }
        });
    }

    load(initial, calls, 0);
}

/*
    Creates a viewing circle, radius 'defaultMaskRadius', over the clip in a random position
    respecting the boundaries of 'circlePaddingX' and 'circlePaddingY'
*/
function drawRandomMask() {
    let paddingX = defaultMaskRadius + circlePaddingX;
    let paddingY = defaultMaskRadius + circlePaddingY;
    let mX = 1920 - paddingX * 2;
    let mY = 1080 - paddingY * 2;

    updateViewWindow(
        Math.floor((Math.random() * mX) + (paddingX)),
        Math.floor((Math.random() * mY) + (paddingY)),
        defaultMaskRadius
    );
}

/*
    Modifies the viewing circle position and radius
*/
function updateViewWindow(x, y, r) {
    viewingCircle.attr('r', r);
    viewingCircle.attr('cx', x);
    viewingCircle.attr('cy', y);
    viewingCircleOutline.attr('r', r + 2);
    viewingCircleOutline.attr('cx', x);
    viewingCircleOutline.attr('cy', y);
}

/*
    Selects a random clip from 'streamerClips' and plays it on screen
*/
function playRandomClip() {
    let clip = streamerClips[Math.floor(Math.random() * streamerClips.length)]

    setCurrentStreamerName(clip.streamer.sourceId);
    videoPlayer.src = videoUrlPrefix + clip.videoId;
    videoPlayer.load();
}

/*
    Expands the viewing circle to show the whole clip
    also shows / hides some elements on screen
 */
function reveal() {
    let interval = setInterval(() => {
        viewingCircle.attr('r', parseInt(viewingCircle.attr('r')) + 20);
        if (viewingCircle.attr('r') > 3000) {
            $('.streamer-name').html(currentStreamer);
            $('.timer').hide();
            $('.streamer-name').fadeIn();
            clearInterval(interval);
        }
    }, 10);
}

/*
    Timer that's shown on screen to display how long is left to guess
*/
function startTimer() {
    let time = guessSeconds;
    let timer = setInterval(() => {
        $('.timer').html(time);
        if (time <= 0) {
            clearInterval(timer);
        }
        time--;
    }, 1000);
    setTimeout(() => {
        $('.timer').fadeIn();
    }, 1000);
}

/*
    Get the name of the streamer from twitch
    livestreamfails.com doesn't provide up to date names of streamers
*/
function setCurrentStreamerName(id) {
    if (id in streamerNameCache) {
        currentStreamer = streamerNameCache[id];
        return;
    }
    $.ajax({
        url: `https://api.twitch.tv/helix/channels?broadcaster_id=${id}`,
        headers: {
            'Authorization': 'Bearer ' + twitchBearerToken,
            'Client-Id': twitchClientId
        },
        success: function (data) {
            streamerNameCache[id] = data.data[0].broadcaster_name;
            currentStreamer = streamerNameCache[id];
        }
    });
}

/*
    Listen to chat messages via the streamelements bot
    Only works when inside a streamelements widget
*/
function listenToMessages() {
    window.addEventListener('onEventReceived', function (obj) {
        if (obj.detail.listener !== "message") {
            return;
        }

        let data = obj.detail.event.data;
        let userVote = data["text"];
        let user = data["displayName"];

        if (userVote.toLowerCase().indexOf(votePrefix) !== 0) {
            return;
        }

        guesses[user] = userVote.substring(votePrefix.length);
    });
}

$(document).ready(function () {
    videoPlayer = document.getElementById("video-player");
    viewingCircle = $(".overlay defs #hole circle");
    viewingCircleOutline = $(".overlay #outline");

    // Kick things off
    loadClips(true);
    listenToMessages();

    // Refresh the list of clips from livestreamfails.com every 30 minutes
    setInterval(() => {
        loadClips();
    }, 1000 * 60 * 30);

    // Read twitch bearer token and client id from the streamelements widget fields
    window.addEventListener('onWidgetLoad', function (obj) {
        twitchBearerToken = obj.detail.fieldData.twitchBearerToken;
        twitchClientId = obj.detail.fieldData.twitchClientId;
    });
});
