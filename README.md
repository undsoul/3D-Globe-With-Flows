Qlik Globe Flows Extension

Qlik Globe Flows is an interactive Qlik Sense extension that brings your geographic data to life with an animated 3D globe visualization. Built with D3.js and integrated with Qlik’s APIs, this extension displays dynamic flows between geographic locations through smooth animations, interactive selections, and customizable visual properties.

Features
	•	Animated Globe Visualization
The extension renders a realistic 3D globe using an orthographic projection. On initial load, the globe animates from a starting position to a natural view. Users can interact with the globe by panning and zooming, with touch-friendly controls that ensure a smooth experience on all devices.
	•	Dynamic Flow Lines
Flow lines are generated as curved great circle arcs between origin and destination points. Their thickness is controlled by a flow measure, visually representing the strength or significance of the connection. Only the visible portions of each flow are drawn to ensure clarity in the visualization  oai_citation:0‡qlik-globe-flows.js.
	•	Interactive Data Points and Country Selection
Both origin and destination points are plotted on the globe. Hovering over a country or point reveals a tooltip with detailed information, while clicking on a location triggers a selection that highlights the country and related flow lines. The extension maintains and restores selection state across interactions.
	•	Zoom and Pan Controls
A set of zoom controls—including zoom in, zoom out, and a reset view button—allows users to focus on specific regions. The controls are designed to be touch-friendly and provide a responsive experience.
	•	Efficient Data Handling
The extension loads data in chunks from Qlik’s backend API. A loading indicator displays progress, and an optional warning message informs users when the displayed data is limited by a configurable point show limit.

Dimensions and Measures

Required Dimensions (6)
	1.	Origin Latitude: Numeric value specifying the latitude of the origin point.
	2.	Origin Longitude: Numeric value specifying the longitude of the origin point.
	3.	Origin Name: Text field for the origin location’s name (used for country identification).
	4.	Destination Latitude: Numeric value specifying the latitude of the destination point.
	5.	Destination Longitude: Numeric value specifying the longitude of the destination point.
	6.	Destination Name: Text field for the destination location’s name.

Optional Measures (0 to 2)
	1.	Flow Measure:
Controls the width of the flow lines. A larger value increases the line thickness, indicating a stronger flow.
	2.	Destination Sizing Measure (Optional):
When enabled, this measure scales destination point sizes based on aggregated values, emphasizing destinations with higher significance.

Property Panel Overview

The extension’s property panel is organized into accordion sections that offer extensive customization options:
	•	Globe Settings:
Customize country colors (default, hover, and selection states), and adjust the ocean’s color for the background.
	•	Point Settings:
Configure the size and appearance of origin and destination points, including border color, width, and opacity. Define a maximum number of points to display, and set up warning messages if the data exceeds this limit.
	•	Flow Settings:
Adjust the appearance of flow lines by setting the base color, opacity, and width scaling factor. The flow measure directly influences the thickness of these lines.
	•	Zoom Settings:
Set the initial zoom level, along with minimum and maximum zoom scales. The zoom speed factor can be tuned to match the desired interactivity level.
	•	Tooltip Settings:
Fully style tooltips with options for background color, text color, padding, font size, border settings, and drop shadow. Separate styling options are available for dimension text and measure values.

For detailed implementation, see the source files (qlik-globe-flows.js and style.css) where the animation logic, data loading, and property customizations are clearly defined  #qlik-globe-flows.js ‡style.css.
