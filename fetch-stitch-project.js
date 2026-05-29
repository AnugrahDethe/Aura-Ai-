import { stitch } from "@google/stitch-sdk";
import fs from 'fs';
import path from 'path';

// Set the API key
process.env.STITCH_API_KEY = process.env.STITCH_API_KEY || "";

async function fetchProject() {
  try {
    const projectId = "12933139627636330683";
    console.log("Fetching project:", projectId);
    
    const project = stitch.project(projectId);
    const screens = await project.screens();
    
    console.log(`Found ${screens.length} screens in the project`);
    
    // Create output directory
    const outputDir = path.join(process.cwd(), 'stitch-screens');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    for (const screen of screens) {
      console.log(`\nScreen ID: ${screen.id}`);
      console.log(`Screen Name: ${screen.name || 'Unnamed'}`);
      
      const html = await screen.getHtml();
      console.log(`HTML URL: ${html}`);
      
      // Fetch the HTML content
      const response = await fetch(html);
      const htmlContent = await response.text();
      
      // Save the HTML to a file
      const fileName = `screen-${screen.id}.html`;
      const filePath = path.join(outputDir, fileName);
      fs.writeFileSync(filePath, htmlContent);
      console.log(`Saved: ${fileName}`);
    }
    
    console.log("\nProject data fetched successfully!");
    console.log(`Screens saved to: ${outputDir}`);
  } catch (error) {
    console.error("Error fetching project:", error);
  }
}

fetchProject();
