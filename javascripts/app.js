var map, geoCoder;
var person = false;

var View = {
// Create content for infoboxes
    createContent: function(infowindow, response) {
        var keys = Object.keys(response.query.pages);
        var key = parseInt(keys[0], 10);
        var paragraph = response.query.pages[key].extract.substring(0,3000);
        var reFirst = /\<b/;
        var reEndFirst = /\/b/;
        var result = reFirst.exec(paragraph);
        // store the index of the opening <b> tag
        var beginName = result.index;
        result = reEndFirst.exec(paragraph);
        var endName = result.index + 3;
        var name = paragraph.substring(beginName, endName);
        // find index of first word of decription
        var reDescription = /is |was |which/;
        result = reDescription.exec(paragraph);
        var beginDescription = result.index;
        var description = paragraph.substring(beginDescription, beginDescription + 250);
        paragraph = name + " " + description;

        var content = "<div class='infoWindow'><h3>Hi, my name is <strong>" +
                    infowindow.title + "</strong>!</h3></div><div>" +
                    paragraph + "...</p></div><div>For more see: <a href='http://www.wikipedia.org/wiki/"+
                    infowindow.title + "' target='_blank'>Wikipedia</a></div>";
        return content;
    },
    errorContent: function(infowindow) {
        var content = "<div class='infoWindow'><h3>Hi, my name is <strong>" +
                    infowindow.title + "</strong>!</h3></div><div>" +
                    "Wikipedia could not be reached</div>";
        return content;
    },
// Custom Map Styles
    bluishMapStyle: [
        {
            stylers: [
                { hue: "#00940c" },
                { saturation: -5 },
                { lightness: -40 }
            ]
        },
        {
            featureType: "all",
            elementType: "labels.icon",
            stylers: [
                {
                    "visibility": "off"
                }
            ]
        },
        {
            featureType: "administrative",
            elementType: "all",
            stylers: [
                {
                    "visibility": "simplified"
                }
            ]
        },
        {
            featureType: "administrative.country",
            elementType: "labels.text",
            stylers: [
                {
                    "visibility": "simplified"
                }
            ]
        },
        {
            featureType: "administrative",
            elementType: "labels.icon",
            stylers: [
                {
                    "visibility": "off"
                }
            ]
        },
        {
            featureType: "administrative.country",
            elementType: "geometry.fill",
            stylers: [
                {
                    "color": "#ff0000"
                },
                {
                    "visibility": "on"
                }
            ]
        },
        {
            featureType: "road",
            elementType: "geometry",
            stylers: [
                { visibility: "off" }
            ]
        },
        {
            featureType: "water",
            elementType: "geometry",
            stylers: [
                { hue: "#0000FF" },
                { saturation:-40}
            ]
        },
        {
            featureType: "administrative.neighborhood",
            elementType: "labels.text.stroke",
            stylers: [
                { visibility: "off" }
            ]
        },
        {
            featureType: "administrative.country",
            elementType: "labels.icon",
            stylers: [
                { "visibility": "off" }
            ]
        },
        {
            featureType: "road",
            elementType: "labels.text",
            stylers: [
                { visibility: "off" }
            ]
        },
        {
            featureType: "road.highway",
            elementType: "geometry.fill",
            stylers: [
                { visibility: "off" }
            ]
        }
    ]
}

/**
 * Prototype for all application data
 */
var Dino = function(data) {
    this.name = data.name;
    this.continents = ko.observableArray(data.continents);
    this.locations = ko.observableArray(data.latLongs);
    this.food = ko.observable(data.food);
    this.description = ko.observable(data.description);
    this.markers = ko.observableArray();
    this.infoWindow = ko.observable();
    this.imageArray = ko.observableArray();

    this.icon = ko.computed(function() {
        if (this.food() === 'carnivore') {
            return 'img/tRex.png';
        } else if (this.food() === 'omnivore') {
            return 'img/blueDino41.png';
        } else if (this.food() === 'herbivore') {
            return 'img/plantEaterSm.png';
        }
    }, this);
};

var ViewModel = function() {

    // Saves a reference to ViewModel object
    var self = this;
    self.mapError = ko.observable(false);
    self.startLoc = new google.maps.LatLng(33.5, 7.6);

    // Keeps track of which instructions have been flashed to the user.
    self.locationInstruction = ko.observable(false);
    self.filterDinoInstruction = ko.observable(false);
    self.dinoListInstruction = ko.observable(false);
    self.showLegend = ko.observable(false);
    self.listVisible = ko.observable(false);
    self.listClicked = ko.observable(false);
    self.buttonVisible = ko.observable(false);
    self.search = false;
    self.legendClicked = ko.observable(false);
    self.buttonText = ko.computed(function() {
        if (self.listVisible()) {
            return "Hide List";
        } else {
            return "Show List";
        }
    });

    self.removeLegend = function() {
        self.showLegend(false);
    };

    // Keeps track of any open infowindows.
    self.activeInfowindow = ko.observable();

    self.init = function() {
        google.maps.event.addDomListener(window, 'load', self.initMap);
    };

    /**
     * Main initialization function which creates the map, sets the styling
     * and other options, and initializes the call to Firebase to retrieve
     * dinosaur data.
     */
    self.initMap = function() {
        //create a new StyledMapType and reference it with the style array
        var bluishStyledMap = new google.maps.StyledMapType(View.bluishMapStyle,
            {name: "Bluish Map"});
        google.maps.visualRefresh = true;

        //Setting starting options of map
        var mapOptions = {
            center: self.startLoc,
            zoom: 3,
            mapTypeControlOptions: {mapTypeIds: [google.maps.MapTypeId.TERRAIN, 'new_bluish_style']},
            maxZoom: 12,
            minZoom: 3
            };

        // Getting map DOM element
        var mapElement = document.getElementById('mapDiv');
        map = new google.maps.Map(mapElement, mapOptions);
        // Show a placeholder image if map.status is not OK
        if (map.status != status.OK) {
            self.mapError(true);
        }
        //relate new mapTypeId to the styledMapType object
        map.mapTypes.set('new_bluish_style', bluishStyledMap);
        //set this new mapTypeId to be displayed
        map.setMapTypeId('new_bluish_style');
        self.fetchFirebase();
        self.locationInstruction(true);
    };

    self.firebaseData = {};

    /**
     * Retrieves data from Firebase and initializes call to create the dinoList
     */
    self.fetchFirebase = function(){
        try {
            var FB = new Firebase("https://intense-inferno-1224.firebaseio.com/");
            FB.on('value', function(data) {
                self.firebaseData = data.val();
                // console.log(self.firebaseData);
                var dinos = self.firebaseData.dinos;
                self.setDinoList(dinos);
                });
            }
        catch(e) {
             // Handle errors with backup copy of data if Firebase is unreachable
            self.setDinoList(dinoData);
        }

    }

    // This is the main source of data for the application.
    self.dinoList = ko.observableArray();

    /**
     * Populates the dinoList array and initializes the call to create markers.
     */
    self.setDinoList = function(data) {
        data.forEach(function(item) {
            self.dinoList().push( new Dino(item) );
        });
        self.createDinoMarkers();
    };

    // Keep track of marker groupings by type
    self.carnivoreMarkers = ko.observableArray();
    self.omnivoreMarkers = ko.observableArray();
    self.herbivoreMarkers = ko.observableArray();

    /**
     * Create map markers and set each one as a property in the Dino object
     * in the dinoList array. Initializes call to create infowindows.
     */
    self.createDinoMarkers = function() {
        var dinoList = self.dinoList();
        for (var i = 0; i < dinoList.length; i++) {
            var dino = dinoList[i];
            for (var j = 0; j < dino.locations().length; j++){
                var icon = dino.icon();
                var lat = dino.locations()[j][0];
                var lon = dino.locations()[j][1];
                var marker = new google.maps.Marker({
                    map: map,
                    position: {
                        lat: lat,
                        lng: lon
                    },
                    icon: icon,
                    title: dino.name,
                    visible: false
                });
                if (dino.food() === 'carnivore') {
                    self.carnivoreMarkers().push(marker);
                } else if (dino.food() === 'herbivore') {
                    self.herbivoreMarkers().push(marker);
                } else if (dino.food() === 'omnivore') {
                    self.omnivoreMarkers().push(marker);
                }
                dino.markers().push(marker);
            }
        }
        self.createInfoWindows();
    };

    /**
     * Creates an infowindow for each dino in dinoList that is attached to all
     * instances of that dino type because there are 64 dinos, but 105 markers.
     */
    self.createInfoWindows = function() {
        var i = 0;
        var dinos = self.dinoList();
        var length = dinos.length;
        for (; i < length; i++) {
            var infowindow = new google.maps.InfoWindow({
                content: "",
                title: dinos[i].name
            });
            // Set the infowindow as a property of that dino in dinoList
            dinos[i].infoWindow(infowindow);
            // Initialize ajax call to Wikipedia for infowindow content
            self.dinoDataRequest(infowindow);
            var j = 0;
            var markers = dinos[i].markers();
            var markerLength = markers.length;
            for (; j < markerLength; j++) {
                var marker = markers[j];
                google.maps.event.addListener(marker, 'click', (function(marker, infowindow) {
                return function() {
                    if (self.activeInfowindow()){
                        self.activeInfowindow().close();
                    }
                    infowindow.open(map, marker);
                    map.panTo(marker.position);
                    self.activeInfowindow(infowindow);
                    };
                })(marker, infowindow));
            }
        }
    };

    /**
     * Ajax call to Wikipedia to get content for infowindows
     */
    self.dinoDataRequest = function(infowindow){
        var url = "http://en.wikipedia.org/w/api.php?action=query&prop=extracts&format=json&exintro=&titles=";
        // Set the correct url for the special case dinos
        var name = infowindow.title;
        if (name === "Tyrannosaurus Rex") {
            name = "Tyrannosaurus";
        } else if (name === "Saturnalia" || name === "Balaur") {
            name += "_(dinosaur)";
        }
        url += name;
        $.ajax( {
        url: url,
        xhrFields: {
            withCredentials: true
        },
        dataType:'jsonp',
        success: function(response) {
            // Parses the response and sets infobox content
            infowindow.setContent(View.createContent(infowindow, response));
        },
        error: function(response) {
            infowindow.setContent(View.errorContent(infowindow));
        },
        type:'GET',
        headers: {
            'Api-User-Agent': "Cynthia O\'Donnell: mimibambino@gmail.com",
            'Access-Control-Allow-Origin': true
            }
        });
    };

    self.location = ko.observable("");

    /**
     * Begins User Interface Instructions and listens for user events
     * Initially, it determines the coordinates for the user's search
     * and displays the user's marker on the map
     */
    self.getLocation = ko.computed(function() {
        geocoder = new google.maps.Geocoder();
        geocoder.geocode( {address: self.location()}, function(results,status) {
            //check if geocode was successful
            if (status === google.maps.GeocoderStatus.OK) {
                // if user's icon is already displayed, remove it from the screen
                if (person) {
                    personMarker.setMap(null);
                }
                // prevent instructions from appearing if used searched already
            if (self.search === false) {
                self.filterDinoInstruction(true);
            }
            // set true to indicate a search has been performed and to display markers
            self.search = true;
            // take the first result from the returned array
            var loc = results[0].geometry.location;
            //center map and display marker
            map.setCenter(loc);
            map.setZoom(5);
            //self.createDinoMarkers(self.dinoList);
            //self.newDinoMarker();
            personMarker = new google.maps.Marker({
                map: map,
                position: loc,
                icon: 'img/manSm.png'
            });
            self.location("");
            self.locationInstruction(false);
            self.showLegend(true);
            // this indicates that the user's icon is displayed
            person = true;
            return loc;
            }
            else if (status != google.maps.places.PlacesServiceStatus.OK) {
        // If no location found based on search
            return self.startLoc;
            }
        });
    });

    /**
     * Called from Knockout binding on the legend element.  Determines
     * which class of dinosaur to display and calls the display function
     */
    self.toggleDinos = function() {
        self.filterDinoInstruction(false);
        self.dinoListInstruction(true);
        self.listVisible(true);
        self.legendClicked(true);
        if (self.activeInfowindow()){
            self.activeInfowindow().close();
        }
        switch (arguments[0]) {
            case "omnivore":
                var markers = self.omnivoreMarkers();
                self.display(markers);
                break;
            case "carnivore":
                markers = self.carnivoreMarkers();
                self.display(markers);
                break;
            case "herbivore":
                markers = self.herbivoreMarkers();
                self.display(markers);
                break;
            case "all":
                break;
        }
    };

    /**
     * Displays or hides groups of dinosaurs
     */
    self.display = function(markers) {
        // if more than one of the markers is hidden, display all of the
        // markers of that type
        if (markers[0].visible === false || markers[2].visible === false) {
            for (var i = 0; i < markers.length; i++) {
            var marker = markers[i];
            marker.setVisible(true);
            }
        // if more that one of the markers is visible, call the hide function
        } else if (markers[0].visible === true || markers[2].visible === true) {
            self.hide(markers);
        }
    };

    // Hides all of the passed in markers
    self.hide = function(markers) {
        for (var i = 0; i < markers.length; i++){
            var marker = markers[i];
            marker.setVisible(false);
        }
    };

    /**
     * Ensures that only one marker is shown when the user clicks on a dinosaur name.
     */
    self.displayThisDino = function() {
        if (self.activeInfowindow()){
            self.activeInfowindow().close();
        }
        self.hide(self.omnivoreMarkers());
        self.hide(self.carnivoreMarkers());
        self.hide(self.herbivoreMarkers());
        self.dinoListInstruction(false);
        self.buttonVisible(true);
        var name = arguments[0].name;
        var dinos = self.dinoList();
        var length = dinos.length;
        var i = 0;
        for (; i < length; i++) {
            var dino = dinos[i];
            var marker = dinos[i].markers()[0];
            if (name === dino.name) {
                marker.setVisible(true);
                map.panTo(marker.position);
                break;
            }
        }
    };

    self.toggleList = function() {
        if (self.listVisible()) {
            self.listVisible(false);
        } else {
            self.listVisible(true);
        }
    }

    self.init();
};

/**
 * Custom binding for fade in effect on instructions
 */
ko.bindingHandlers.fadeVisible = {
    init: function(element, valueAccessor) {
        // Initially set the element to be instantly visible/hidden depending on the value
        var value = valueAccessor();
        $(element).toggle(ko.unwrap(value)); // Use "unwrapObservable" so we can handle values that may or may not be observable
    },
    update: function(element, valueAccessor) {
        // Whenever the value subsequently changes, slowly fade the element in or out
        var value = valueAccessor();
        ko.unwrap(value) ? $(element).fadeIn() : $(element).fadeOut();
    }
};

ko.applyBindings( new ViewModel() );