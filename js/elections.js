//Wrap everything in a self-executing anonymous function to move to local scope
(function(){

    //pseudo-global variables
    var attrArray = ["pop_vote_Biden", "pop_vote_Trump", "pop_vote_all_others", "total_vote", "over_18_total"]; //list of attributes
    var expressed = attrArray[0]; //initial attribute

    //variables for user friendly names for attribute selection
    var attrFriendlyNames = { "pop_vote_Biden": "Popular Votes for Biden", "pop_vote_Trump": "Popular Votes for Trump", 
        "pop_vote_all_others": "Popular Votes for All Other Candidates", "total_vote": "Total Votes Cast", 
        "over_18_total": "Population over 18 Years Old" };     


    //chart frame dimensions
    var chartWidth = window.innerWidth * 0.425,
        chartHeight = 473,
        leftPadding = 39,
        rightPadding = 2,
        topBottomPadding = 5,
        chartInnerWidth = chartWidth - leftPadding - rightPadding,
        chartInnerHeight = chartHeight - topBottomPadding * 2,
        translate = "translate(" + leftPadding + "," + topBottomPadding + ")";

    //create a scale to size bars proportionally to frame and for axis
    var yScale = d3.scaleLinear()
        .range([463, 0])
        .domain([0, 35000000]); //for total pop needs to go as high as 35000000



    window.onload = setMap();


    //set up map
    function setMap() {
        //map frame dimensions
        var width = window.innerWidth * 0.5,
            height = 460;

        //create new svg container for the map
        var map = d3.select(".map-container")
            .append("svg")
            .attr("class", "map")
            .attr("width", width)
            .attr("height", height);

        //create Albers equal area conic projection centered on United States but including Hawaii, Alaska
        var projection = d3.geoAlbersUsa() //geoAlbersUsa projection does not take center, rotate, or parallel operators (removed all)

            .scale(800.00)

            .translate([width / 2, height / 2]);

        //Set path
        var path = d3.geoPath()
            .projection(projection);
        
        
        //use Promise.all to parallelize asynchronous data loading
        var promises = [];    
            promises.push(d3.csv("data/popular_vote_by_state.csv")); //load attributes from csv    
            promises.push(d3.json("data/lakes.topojson")); //load background spatial data    
            promises.push(d3.json("data/US_States_04.topojson")); //load choropleth spatial data    

        

        //Error catching to tell user if data not loaded
        Promise.all(promises)
            .then(callback)
            .catch(function(error) {
                console.log("Error loading data:", error);
            });
        
        //function to call back data and load topojson files and graticules
        function callback(data) {
            var pop_Vote = data[0],
                lakes = data[1],
                states = data[2];

            //translate TopoJSON
            var lakesFeature = topojson.feature(lakes, lakes.objects.great_lakes_01),
                statesFeature = topojson.feature(states, states.objects.US_States_04).features;
        

            //sets lakes
            var lakesPath = map.append("path")
            .datum(lakesFeature)
            .attr("class", "lakes")
            .attr("d", path);


            //join csv data to topojson enumeration units
            var joined_statesFeatures = joinData(statesFeature, pop_Vote);

            //create the color scale
            var colorScale = makeColorScale(pop_Vote);

            //add enumeration units to the map
            setEnumerationUnits(joined_statesFeatures, map, path, colorScale);

            //add coordinated visualization to the map
            setChart(pop_Vote, colorScale);

            //adds dropdown
            createDropdown(pop_Vote);
           
        };
    }; //end of setMap()
        


    //function to create coordinated bar chart
    function setChart(pop_Vote, colorScale){

        // Compute the maximum value in the dataset and cap it (chatGPT generated)
        var maxValue = d3.max(pop_Vote, function(d) {
            return +d[expressed];
        });
        var padding = maxValue * 0.1;
        var cappedMaxValue = Math.min(maxValue + padding, 35000000);

        //create a second svg element to hold the bar chart
        var chart = d3.select(".chart-container")
            .append("svg")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("class", "chart");

        //create a rectangle for chart background fill
        var chartBackground = chart.append("rect")
            .attr("class", "chartBackground")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);
        
        //set yScale for chart (chatGPT generated)
        var yScale = d3.scaleLinear()
            .range([chartInnerHeight, 0])
            .domain([0, cappedMaxValue]);

        //set bars for each state (student)
        var bars = chart.selectAll(".bar")
            .data(pop_Vote)
            .enter()
            .append("rect")
            .sort(function(a, b){
                return b[expressed]-a[expressed]
            })
            .attr("class", function(d){
                return "bar " + d.state;
            })
            .attr("width", chartInnerWidth / pop_Vote.length - 1)
            .on("mouseover", function(event, d){
                highlight(d);
            }) 
            .on("mouseout", function(event, d){
                dehighlight(d);
            })
            .on("mousemove", moveLabel)
            .attr("x", function(d, i){
                return i * (chartInnerWidth / pop_Vote.length) + leftPadding;
            })
            //chatGPT generated
            .attr("height", function(d) {
                return chartInnerHeight - yScale(parseFloat(d[expressed]));
            })
            //student original project
            .attr("y", function(d, i){
                return yScale(parseFloat(d[expressed])) + topBottomPadding;
            })
            .style("fill", function(d){
                return colorScale(d[expressed]);
            });

        //add style descriptor to each rect
        var desc = bars.append("desc")
            .text('{"stroke": "none", "stroke-width": "0px"}')

        //create a text element for the chart title
        var chartTitle = chart.append("text")
            .attr("x", 75)
            .attr("y", 40)
            .attr("class", "chartTitle")
            .attr("fill", "white")
            .text("Votes by State");

        //create vertical axis generator
        var yAxis = d3.axisLeft()
            .scale(yScale);

        //place axis
        var axis = chart.append("g")
            .attr("class", "axis")
            .attr("transform", translate)
            .call(yAxis);

        //create frame for chart border
        var chartFrame = chart.append("rect")
            .attr("class", "chartFrame")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);

        //set bar positions, heights, and colors
        updateChart(bars, pop_Vote.length, colorScale, cappedMaxValue);
    };
        


    //graticules (removed for new projection)

    // Joins the pop_Vote CSV and the US_States_04 TopoJSON
    function joinData(statesFeature, pop_Vote) {
        // Loop through CSV to assign each set of CSV attribute values to TopoJSON state
        pop_Vote.forEach(function(csvState) {
            var csvKey = csvState.state; 

            // Loop through TopoJSON states to find the correct region
            statesFeature.forEach(function(topojsonFeature) {
                var topojsonProps = topojsonFeature.properties;
                var topojsonKey = topojsonProps.STUSPS;

                // Where primary keys match, transfer CSV data to TopoJSON properties object
                if (topojsonKey === csvKey) {
                    // Assign all attributes and values
                    attrArray.forEach(function(attr) {
                        var val = parseFloat(csvState[attr]);
                        topojsonProps[attr] = val; 
                    });
                }
            });
        });

        return statesFeature;
    }

    //sets enumeration units on the map and colors them appropriately
    function setEnumerationUnits(statesFeature,map,path,colorScale){

        //add US States to map
        var statesPath = map.selectAll(".states")
            .data(statesFeature)
            .enter()
            .append("path")
            .attr("class", function(d){
                return "states " + d.properties.STUSPS;
            })
            .attr("d", path)        
            .style("fill", function(d){            
                var value = d.properties[expressed];            
                if(value) {                
                    return colorScale(d.properties[expressed]);            
                } else {                
                    return "#ccc";           
                }
            })
            .on("mouseover", function(event, d){
                highlight(d.properties);
            })
            .on("mouseout", function(event, d){
                dehighlight(d.properties);
            })
            .on("mousemove", moveLabel);
        
        
        //dehighlight features
        var desc = statesPath.append("desc")
            .text('{"stroke": "#000", "stroke-width": "0.5px"}');
    }


    //function to create color scale generator
    function makeColorScale(data){
        var colorClasses = [
            "#edf8fb",
            "#b3cde3",
            "#8c96c6",
            "#8856a7",
            "#810f7c"
        ];

        //create color scale generator
        var colorScale = d3.scaleThreshold()
            .range(colorClasses);

        //build array of all values of the expressed attribute
        var domainArray = [];
        for (var i=0; i<data.length; i++){
            var val = parseFloat(data[i][expressed]);
            domainArray.push(val);
        };

        //cluster data using ckmeans clustering algorithm to create natural breaks
        var clusters = ss.ckmeans(domainArray, 5);
        //reset domain array to cluster minimums
        domainArray = clusters.map(function(d){
            return d3.min(d);
        });
        //remove first value from domain array to create class breakpoints
        domainArray.shift();

        //assign array of last 4 cluster minimums as domain
        colorScale.domain(domainArray);

        return colorScale;
    };

    //function to create a dropdown menu for attribute selection
    function createDropdown(pop_Vote){
        //add select element
        var dropdown = d3.select("body")
            .append("select")
            .attr("class", "dropdown")
            .on("change", function(){
                changeAttribute(this.value, pop_Vote)
            }); 
        

        //add initial option
        var titleOption = dropdown.append("option")
            .attr("class", "titleOption")
            .attr("disabled", "true")
            .text("Select Attribute");

        //add attribute name options
        var attrOptions = dropdown.selectAll("attrOptions")
            .data(attrArray)
            .enter()
            .append("option")
            .attr("value", function(d){ return d })
            .text(function(d){ return attrFriendlyNames[d] });
        };


    //dropdown change event handler
    function changeAttribute(attribute, pop_Vote) {
        //change the expressed attribute
        expressed = attribute;

        // Compute the maximum value in the dataset and cap it (chatGPT generated)
        var maxValue = d3.max(pop_Vote, function(d) {
            return +d[expressed];
        });
        var padding = maxValue * 0.1;
        var cappedMaxValue = Math.min(maxValue + padding, 35000000);

        //recreate the color scale (student)
        var colorScale = makeColorScale(pop_Vote);

        //recolor enumeration units
        var states = d3.selectAll(".states")
            .transition()
            .duration(1000)
            .style("fill", function(d){            
                var value = d.properties[expressed];            
                if(value) {                
                    return colorScale(value);           
                } else {                
                    return "#ccc";            
                }   
        });
        //Sort, resize, and recolor bars
        var bars = d3.selectAll(".bar")
            //Sort bars
            .sort(function(a, b){
                return b[expressed] - a[expressed];
            })
            .transition() //add animation
            .delay(function(d, i){
                return i * 20
            })
            .duration(500);
            

        updateChart(bars, pop_Vote.length, colorScale, cappedMaxValue);
    
        // Update Y-axis with capped max value (chatGPT generated to end of change Attribute())
        var newYScale = d3.scaleLinear()
        .range([chartInnerHeight, 0])
        .domain([0, cappedMaxValue]);

        var yAxis = d3.axisLeft()
            .scale(newYScale);

        d3.select(".chart").select(".axis")
            .transition()
            .duration(1000)
            .call(yAxis);

        // Update the Y-axis scale
        yScale = newYScale;

    }; //end of changeAttribute()


    //function to position, size, and color bars in chart
    function updateChart(bars, n, colorScale, cappedMaxValue){

        // Update Y-axis scale (chatGPT generated)
        yScale = d3.scaleLinear()
            .range([chartInnerHeight, 0])
            .domain([0, cappedMaxValue]);

        //position bars
        bars.attr("x", function(d, i){
                return i * (chartInnerWidth / n) + leftPadding;
            })
            //Size/resize bars (chatGPT generated)
            .attr("height", function(d) {
                return chartInnerHeight - yScale(parseFloat(d[expressed]));
            })
            //student original project
            .attr("y", function(d) {
                return yScale(parseFloat(d[expressed])) + topBottomPadding;
            })
            //color/recolor bars
            .style("fill", function(d){            
                var value = d[expressed];            
                if(value) {                
                    return colorScale(value);            
                } else {                
                    return "#ccc";            
                }    
        });
        //add text to chart title
        var chartTitle = d3.select(".chartTitle")
            .text("Votes by State");




    };//end of updateChart


    //function to highlight enumeration units and bars
    function highlight(props){
        //change stroke
        var affected = props.state || props.STUSPS;
        var selected = d3.selectAll("." + affected)
            .style("stroke", "yellow")
            .style("stroke-width", "2");
        setLabel(props);

    };

    //function to reset the element style on mouseout
    function dehighlight(props){
        var affected = props.state || props.STUSPS;
        var selected = d3.selectAll("." + affected)
            .style("stroke", function(){
                return getStyle(this, "stroke")
            })
            .style("stroke-width", function(){
                return getStyle(this, "stroke-width")
            });

        function getStyle(element, styleName){
            var styleText = d3.select(element)
                .select("desc")
                .text();

            var styleObject = JSON.parse(styleText);

            return styleObject[styleName];
        };
        //remove info label
        d3.select(".infolabel")
            .remove();
    };

    
    //function to create dynamic label
    function setLabel(props){
        //label content
        var labelAttribute = "<h1>" + props[expressed] +
            "</h1><b>" + expressed + "</b>";

        //create info label div
        var infolabel = d3.select("body")
            .append("div")
            .attr("class", "infolabel")
            .attr("id", props.state + "_label")
            .html(labelAttribute);

        var stateName = infolabel.append("div")
            .attr("class", "labelname")
            .html(props.name)
            .html(props.state)
    };
    


    //function to move info label with mouse
    function moveLabel(event){
        //get width of label
        var labelWidth = d3.select(".infolabel")
            .node()
            .getBoundingClientRect()
            .width;

        //use coordinates of mousemove event to set label coordinates
        var x1 = event.clientX + 10,
            y1 = event.clientY - 75,
            x2 = event.clientX - labelWidth - 10,
            y2 = event.clientY + 25;

        //horizontal label coordinate, testing for overflow
        var x = event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1; 
        //vertical label coordinate, testing for overflow
        var y = event.clientY < 75 ? y2 : y1; 

        d3.select(".infolabel")
            .style("left", x + "px")
            .style("top", y + "px");
    };

    
})(); //last line

