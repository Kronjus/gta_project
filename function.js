

// Obstacle hinzufügen
function update_obstacles() {
    const url = 'https://gta-project-six.vercel.app/update_obstacles?position=' + position
    fetch(url)
        .then(response => response.json())
            .then(json => {
                console.log(json);
            })
}

// Navigation starten
function start_navigation() {
    const url = 'https://gta-project-six.vercel.app/start_navigation?start_pos=' + start_pos + '&max_grad=' + max_grad + '&dest=' + dest
}
function input_var (lat,lng,max_grad,dest) {
    let postData =
        '<wfs:Transaction\n'
            + 'service="WFS"\n'
            + 'version="1.0.0"\n'
            + 'xmlns="http://www.opengis.net/wfs"\n'
            + 'xmlns:wfs="http://www.opengis.net/wfs"\n'
            + 'xmlns:gml="http://www.opengis.net/gml"\n'
            + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
            + 'xmlns:GTA24_project="https://www.gis.ethz.ch/GTA24_project" \n'
            + 'xsi:schemaLocation="https://www.gis.ethz.ch/GTA24_project \n https://baug-ikg-gis-01.ethz.ch:8443/geoserver/GTA24_project/wfs?service=WFS&amp;version=1.0.0&amp;request=DescribeFeatureType&amp;typeName=GTA24_project%3Ainput \n'
            +                     'http://www.opengis.net/wfs\n'
            +                    ' https://baug-ikg-gis-01.ethz.ch:8443/geoserver/schemas/wfs/1.0.0/WFS-basic.xsd">\n'
            + '<wfs:Insert>\n'
            + '   <GTA24_project:input>\n'
            + '     <start_long>'+lng+'</start_long>\n'
            + '     <start_lat>'+lat+'</start_lat>\n'
            + '     <max_grad>'+max_grad+'</max_grad>\n'
            + '     <destination>'+dest+'</destination>\n'
            + '     <geometry>\n'
            + '         <gml:Point srsName="http://www.opengis.net/gml/srs/epsg.xml#4326">\n'
            + '             <gml:coordinates xmlns:gml="http://www.opengis.net/gml" decimal="." cs="," ts=" ">'+lng+ ',' +lat+'</gml:coordinates>\n'
            + '         </gml:Point>\n'
            + '     </geometry>\n'
            + '   </GTA24_project:input>\n'
            + '</wfs:Insert>\n'
        + '</wfs:Transaction>';

    $.ajax({
        method: "POST",
        url: wfs,
        dataType: "xml",
        contentType: "text/xml",
        data: postData,
        success: function() {	
            //Success feedback
            console.log("Success from AJAX, data sent to Geoserver");
            
            // Do something to notisfy user
            alert("Check if data is inserted into database");
        },
        error: function (xhr, errorThrown) {
            //Error handling
            console.log("Error from AJAX");
            console.log(xhr.status);
            console.log(errorThrown);
            }
    });
}