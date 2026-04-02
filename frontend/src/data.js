/* ──────────────────────────────────────────────
 *  Mock data for development / offline mode.
 *  In production this will be replaced by API calls.
 * ────────────────────────────────────────────── */

export const levels = {
  100: 'Awareness',
  200: 'Working',
  300: 'Proficient',
  400: 'Expert',
};

export const categories = ['Apps & AI', 'Data', 'Infrastructure'];

export const skillCategories = {
  'AI & Copilot': ['GitHub Copilot','GitHub Copilot CLI','Microsoft Agent Framework','Model Context Protocol (MCP)','Azure SRE Agent','Microsoft 365 Copilot','Microsoft Copilot Studio','Microsoft Foundry Agent Service'],
  'AI Techniques': ['Image Classification','Image Segmentation','Object Detection','Prompt Engineering','Retrieval-Augmented Generation (RAG)','Supervised Fine-Tuning','Responsible AI'],
  'Azure AI Services': ['Azure AI Anomaly Detector','Azure AI Bot Service','Azure AI Content Safety','Azure AI Custom Vision','Azure AI Face','Azure AI Search','Azure AI Services (OpenAI)','Azure AI Video Indexer','Azure Document Intelligence','Azure Language','Azure Machine Learning','Azure Speech','Azure Vision','Microsoft Foundry'],
  'DevOps & Dev Tools': ['Infrastructure as Code (IaC)','Redis','Unit Testing','Azure Functions','Playwright','Git','Azure App Configuration','Azure Container Apps','Azure Container Instance','Azure Container Registry','Azure Kubernetes Service (AKS)','Azure Pipelines (Azure DevOps Pipelines)','GitHub Actions','Azure DevOps','GitHub'],
  'Messaging': ['Apache Kafka','Azure Event Grid','Azure Event Hubs','Azure Service Bus'],
  'Monitoring': ['Azure Application Insights','Azure Monitor','Elasticsearch'],
  'Networking': ['Azure API Management','Azure Application Gateway','Azure Bastion','Azure Firewall','Azure Front Door','Azure Private Endpoint','Azure Virtual Network (VNet)'],
  'IaC': ['Bicep','Terraform'],
  'Languages': ['C# / .NET','Go','Java','JavaScript / TypeScript','Python','Bash / Shell','PowerShell'],
  'Security & Identity': ['Azure Policy','Microsoft Entra ID','Azure Key Vault','Microsoft Sentinel'],
  'Databases': ['Azure MySQL','SQL MI','SQL DB','SQL on VMs','SQL DB Hyperscale','DB for PostgreSQL','Horizon DB','CosmosDB','Oracle Database @Azure','Document DB'],
  'Data Platform': ['Azure Arc','Cache for Redis','Azure Managed Redis','Analysis Services','Power BI Embedded','Power BI','Event Hubs','Log Analytics Workspace','Synapse Analytics Serverless','Synapse Analytics Dedicated Pools','Azure Data Factory','Data Engineering and Data Science'],
  'Fabric': ['OneLake','Cosmos DB on Fabric','Fabric Data Engineering','Fabric Data Science','Fabric Data Factory','Fabric Data Warehouse','Fabric Admin, governance, and security','Fabric Purview integration','Fabric Real-Time Intelligence','Fabric IQ','SQL DB on Fabric','Fabric Capacity Management'],
  'Compute': ['VM Sizes','Availability Sets/Zones','ScaleSets','Spot VMs','Dedicated Hosts','AKS','Azure Container Apps','Azure Container Instances','Container Registry','Azure Functions','App Service','Static WebApps','Azure Batch','Azure VMWare Solution','HPC'],
  'Storage': ['Access Tiers','Lifecycle Management','Object Replication','Immutable Storage','Azure Files','Managed Disks','File Sync','Elastic SAN','AzCopy','Storage Explorer','Data Box','Storage Mover'],
  'Networking (Infra)': ['Virtual Networks','IP Addressing','vNET Peering','NSGs/ASG','VPN Gateways','Express Route','Virtual WAN','Bastion','Load Balancers','App Gateway','Front Door','Traffic Manager','Azure Firewall','DDoS Protection','Private Link','Network Watcher'],
};

/** Flat array of every skill in insertion order */
export const allSkills = Object.values(skillCategories).flat();

/** Mapping: skill name → category name */
export const skillToCategory = {};
for (const [cat, skills] of Object.entries(skillCategories)) {
  for (const s of skills) {
    skillToCategory[s] = cat;
  }
}

/** Mapping: skill name → global index (matches people.skills[]) */
export const skillIndex = {};
allSkills.forEach((s, i) => {
  skillIndex[s] = i;
});

/* Generate deterministic mock data for N people */
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const MOCK_NAMES = [
  'Alex Johnson', 'Sam Rivera', 'Jordan Lee', 'Casey Morgan',
  'Riley Chen', 'Taylor Kim', 'Drew Patel', 'Avery Singh',
  'Quinn Brooks', 'Jamie Torres', 'Morgan Gray',
];
const MOCK_QUALIFIERS = ['Apps & AI', 'Apps & AI', 'Infrastructure', 'Apps & AI',
  'Data', 'Infrastructure', 'Infrastructure', 'Apps & AI',
  'Apps & AI', 'Apps & AI', 'Data'];

export const people = MOCK_NAMES.map((name, i) => {
  const rand = seededRandom(i * 7919 + 42);
  const skills = allSkills.map(() => {
    const r = rand();
    if (r < 0.35) return 100;
    if (r < 0.60) return 200;
    if (r < 0.82) return 300;
    return 400;
  });
  return { name, qualifier: MOCK_QUALIFIERS[i], skills };
});

/** Ordered category names */
export const categoryNames = Object.keys(skillCategories);

/**
 * Get a person's level for a given skill.
 * Returns the numeric level (100-400) or 0 if not found.
 */
export function getSkillLevel(person, skillName) {
  const idx = skillIndex[skillName];
  return idx !== undefined ? person.skills[idx] : 0;
}

/**
 * Human-readable level label.
 */
export function levelLabel(val) {
  return levels[val] || 'None';
}
