/*!
*	\file		main.js
*	\author 	Inderpreet Singh (google.com/+InderpreetSingh)
* 	\license	GPL2(see license.txt)
*
*	\section 	Project: Edison Gardener Entry Point file
*
*	\section	HISTORY
*	v1.0
*
* I put a lot of time and effort into our project and hence this copyright 
* notice ensures that people contribute as well as each contribution is 
* acknowledged. Please retain this original notice and if you make changes
* please document them along with your details.
*
* The latest copy of this project/library can be found at: 
* https://github.com/inderpreet/
*
*/
// ----------------------------------------------------------------------------

/*jslint node:true, vars:true, bitwise:true, unparam:true */
/*jshint unused:true */
// Leave the above lines for propper jshinting


var exec = require('child_process').exec;
var cmdIllumination = 'iotkit-admin observation illuminationhp ';
var cmdTemperature = 'iotkit-admin observation temperaturehp ';
var cmdSoilMoisture = 'iotkit-admin observation soilmoisturegarden ';


var mraa = require('mraa');
var version = mraa.getVersion();

var groveSensor = require('jsupm_grove');
var grove_moisture = require('jsupm_grovemoisture');
var upmMQ5 = require("jsupm_gas");
var waterFlow_lib = require('jsupm_grovewfs');

// ----------------------------------------------------------------------------
// IO Defines
var GardenPump = new mraa.Gpio(13); //setup digital read on Digital pin )
GardenPump.dir(mraa.DIR_OUT); //set the gpio direction to output
GardenPump.write(0); //set the digital pin to low

var HPPump = new mraa.Gpio(12);
HPPump.dir(mraa.DIR_OUT);
HPPump.write(0);

var HPLamp = new mraa.Gpio(3);
HPLamp.dir(mraa.DIR_OUT);
HPLamp.write(0);


var HPDrain = new mraa.Gpio(2);
HPDrain.dir(mraa.DIR_OUT);
HPDrain.write(0);

var myLED = new mraa.Gpio(5);
myLED.dir(mraa.DIR_OUT);

// Inputs
var HPLevel = new mraa.Gpio(8);
HPLevel.dir(mraa.DIR_IN);

var myButton = new mraa.Gpio(6);
myButton.dir(mraa.DIR_IN);

// Instantiate a Grove Water Flow Sensor on digital pin D2
var myWaterFlow_obj = new waterFlow_lib.GroveWFS(4);
// set the flow counter to 0 and start counting
myWaterFlow_obj.clearFlowCounter();
myWaterFlow_obj.startFlowCounter();

// Analog Sensors
var illuminationhp = new groveSensor.GroveLight(0);
var myMoistureObj = new grove_moisture.GroveMoisture(3);
// Attach gas sensor to AIO0
var myMQ5 = new upmMQ5.MQ5(1);

var analogPin0 = new mraa.Aio(2); //setup access analog input Analog pin #0 (A0)

// Some More Gas sensor Stuff
var threshContext = new upmMQ5.thresholdContext;
threshContext.averageReading = 0;
threshContext.runningAverage = 0;
threshContext.averagedOver = 2;

// ----------------------------------------------------------------------------
//mqtt stuff here
var mqtt=require('mqtt');
var broker='mqtt://192.168.1.105';
var client=mqtt.connect(broker);

// ----------------------------------------------------------------------------
// MQTT Functions
client.on('connect', function(){
    client.subscribe('GardenerEdisonIn');
    client.publish('GardenerEdisonOut', 'Edison The Gardener Started');
});

// we want mraa to be at least version 0.6.1
if (version >= 'v0.6.1') {
    console.log('mraa version (' + version + ') ok');
}
else {
    console.log('meaa version(' + version + ') is old - this code may not work');
}

// ----------------------------------------------------------------------------
// Start with the LCD
var lcd = require('jsupm_i2clcd');
var display = new lcd.Jhd1313m1(0, 0x3E, 0x62);
display.clear();
display.setCursor(0,0);
display.write("Edison");
showLCDmess('The Gardener');

// ----------------------------------------------------------------------------
// Timed Loop Events Here
setInterval(readIlluminationHP, 60000);
setInterval(readTemperatureHP, 60000);
setInterval(readSoilMoistureGarden, 60000);

// ----------------------------------------------------------------------------
// MQTT - Handle Message Events Asynchronously
// All valid MQTT Messages MUST begin with a :
client.handleMessage=function(packet, cb){
    var message = packet.payload.toString();
    
    console.log(message); 
    
    // ------------------------ Garden Pump -----------------------------------
    if(message.search('gardenpump ON') >=0 ){
        GardenPumpWater();
    }
    
    if(message.search('startup') >= 0){
        showLCDmess('The Gardener');
    }
    // ------------------------ Hydroponics LAMP ------------------------------
    if(message.search('hplamp ON') >=0 ){
        HPLamp.write(1);
        showLCDmess('Lamp ON');
        client.publish('GardenerEdisonOut', 'LED Lamps ON');
    }else if(message.search('hplamp OFF') >= 0){
        HPLamp.write(0);
        showLCDmess('Lamp OFF');
        client.publish('GardenerEdisonOut', 'LED Lamps OFF');
    }

    // ------------------------ Hydroponics PUMP ------------------------------
    if(message.search('hppump ON') >= 0 ){
        //Do the Hydroponic Pumping while not full
        HPPump.write(1);
        showLCDmess('HP Pump On');
        client.publish('GardenerEdisonOut', 'Nutrient Pump ON');
        while(HPLevel.read() > 0 | myButton.read()!=0 ){} //blocking! 
        HPPump.write(0);
        showLCDmess('HP Pump Off');
        client.publish('GardenerEdisonOut', 'Nutrient Pump OFF');
    }
    
    if(message.search('hpdrain ON') >= 0 ){
        //Do the Hydroponic Draining
        HPDrain.write(1);
        client.publish('GardenerEdisonOut', 'Draining Farm');
        setTimeout(HPDrainOff, 60000);        
    }
    cb();
};

//-----------------------------------------------------------------------------
// A little function to switch off the pump

// Trigger function when level
//HPLevel.isr(mraa.EDGE_BOTH, function(){
//    HPPump.write(0);
//    showLCDmess('HP Pump Off');
//    client.publish('GardenerEdisonOut', 'Nutrient Pump OFF');
//    });

myButton.isr(mraa.EDGE_BOTH, function(){
    HPPumpOff();
    GardenPumpOff();
    HPDrainOff();
    //Now the LED
    myLED.write(1);
    setTimeout(function(){myLED.write(0); }, 5000);
    });
    
function HPDrainOff(){
    HPDrain.write(0);
    showLCDmess('HP Drain Off');
    client.publish('GardenerEdisonOut', 'Drain Pump OFF');
}
    
function HPPumpOff(){
    HPPump.write(0);
    showLCDmess('HP Pump Off');
    
}

    
function GardenPumpOff(){
    console.log('Pump Switched Off');
    GardenPump.write(0);
    client.publish('GardenerEdisonOut', 'Garden Pump OFF');
    showLCDmess('Garden Pump Off');
}

function GardenPumpWater(){
    var GardenSoilMoisture = GardenMeasureMoisture();
    
    var MoistureThreshold = 300; // Set the Threshold for watering HERE!
    
    if(GardenSoilMoisture<MoistureThreshold){
        // Switch the Pump ON
        console.log('Garden Pump Switched On');
        display.setCursor(1,0);
        display.setColor(200,200,200);
        display.write('Garden Pump On  ');
        GardenPump.write(1);
        client.publish('GardenerEdisonOut', 'Garden Pump ON');
    
        // Switch the Pump off after 15 seconds
        var delay = 20000; // Duration of Pump ON
        setTimeout(GardenPumpOff, delay);
    } else {
        console.log('Soil is pretty wet');
        display.setCursor(1,0);
        display.setColor(200,200,200);
        display.write('Soil already wet');
        client.publish('GardenerEdisonOut', 'Soil Already Wet');
        setTimeout(function(){ display.setColor(0,0,0); }, 5000); // switch of the LEDs after 5 seconds        
    }
}


function GardenMeasureMoisture(){
    // Values (approximate):
    // 0-300,   sensor in air or dry soil
    // 300-600, sensor in humid soil
    // 600+,    sensor in wet soil or submerged in water
	var result;
	var moisture_val = parseInt(myMoistureObj.value());
	if (moisture_val >= 0 && moisture_val < 300)
		result = "Dry";
	else if (moisture_val >= 300 && moisture_val < 600)
		result = "Moist";
	else
		result = "Wet";
	console.log("Moisture value: " + moisture_val + ", " + result);
    var mess = 'Soil Moisture:' + moisture_val;
    //client.publish('GardenerEdisonOut\Moisture', mess);
    return moisture_val;
}
// Soil Moisture Measurement Function
function readSoilMoistureGarden(){
    var moisture_val = parseInt(myMoistureObj.value());
    //console.log("Moisture value: " + moisture_val);
    var tmp1 = moisture_val.toString();
    var cmd = cmdSoilMoisture + tmp1;
    
    client.publish('GardenerEdisonOut/Moisture', tmp1); 
    console.log(cmd);
    exec(cmd, function(error, stdout, stderr){
        //respose is in stdout
    }); 
}

// Illumination Measurement Function
function readIlluminationHP(){
    //console.log(illuminationhp.name() + " reads value " + illuminationhp.value() + " lux.");
    
    var tmp1=illuminationhp.value();
    var tmp2=tmp1.toString();
    
    var cmd=cmdIllumination + tmp2;
    client.publish('GardenerEdisonOut/Illumination', tmp2);
    console.log(cmd);
    exec(cmd, function(error, stdout, stderr){
        //respose is in stdout
    });         
}

// LM35 Temperature Measurement Function.
function readTemperatureHP(){
    var analogValue = analogPin0.read(); //read the value of the analog pin
    //console.log(analogValue); //write the value of the analog pin to the console
    var cel=((analogValue/1024.0)*5000)/10;
    //console.log('Temp=' + cel);
    var tmp1=cel.toString();
    client.publish('GardenerEdisonOut/Temperature', tmp1);
    var cmd = cmdTemperature + cel;
    console.log(cmd);
    exec(cmd, function(error, stdout, stderr){
        //respose is in stdout
    });
}

function showLCDmess(mess){
    display.setCursor(1,0);
    display.write('                '); //Clear the second line
    display.setCursor(1,0);
    display.write(mess);
    display.setColor(0,255,50);
    setTimeout(function(){display.setColor(0,0,0);}, 30000); //Turn off the display after 30 seconds
}
function readMQ5Sensor(){
    var buffer = new upmMQ5.uint16Array(128);
    var len = myMQ5.getSampledWindow(2, 128, buffer);
    if (len)
    {
        var thresh = myMQ5.findThreshold(threshContext, 30, buffer, len);
        myMQ5.printGraph(threshContext, 5);
        //if (thresh)
        //    console.log("Threshold is " + thresh);
    }
}

function readFlowSensor(){
    var millis, flowCount, fr;
    var myInterval = setInterval(function(){
        // we grab these (millis and flowCount) just for display
        // purposes in this example
        millis = myWaterFlow_obj.getMillis();
        flowCount = myWaterFlow_obj.flowCounter();

        fr = myWaterFlow_obj.flowRate();

        // output milliseconds passed, flow count, and computed flow rate
        outputStr = "Millis: " + millis + " Flow Count: " + flowCount +
        " Flow Rate: " + fr + " LPM";
        console.log(outputStr);

        // best to gather data for at least one second for reasonable
        // results.
        }, 2000);
    return fr;
}
