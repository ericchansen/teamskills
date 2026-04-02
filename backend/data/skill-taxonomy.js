/**
 * Canonical skill category hierarchy and skill-to-category mappings.
 * Used by migrate.js to ensure the full category tree exists on every startup
 * and to categorize skills that arrive from SharePoint or other imports.
 *
 * IMPORTANT: This file uses NAMES and PATHS — never hardcoded database IDs.
 * Production may have different IDs than seed.sql.  The migration resolves
 * names to IDs at runtime by matching (name, parent_id) pairs.
 *
 * Structure: Role (L1) > Domain (L2) > Subdomain (L3)
 * Source: database/seed.sql + production SharePoint "Skills Matrix MVP" list
 */
module.exports = {
  /**
   * Hierarchical category tree.  L1 keys → L2 keys → L3 arrays.
   * An empty object or array means the category is a leaf.
   */
  categoryTree: {
    'Apps & AI': {
      'Agentic AI': ['Development Tools', 'Framework', 'Solution'],
      'AI & Machine Learning': [
        'Fundamentals: Computer Vision',
        'Fundamentals: Large Language Models (LLMs)',
        'Fundamentals: Security',
        'Solution',
      ],
      'Application Development': ['Fundamentals', 'Solution', 'Best Practices', 'Framework'],
      'Containers': ['Solution'],
      'DevOps': ['CI/CD', 'Platform'],
      'Messaging & Event Streaming': [],
      'Monitoring & Observability': [],
      'Networking': ['Solution'],
      'Programming Languages': ['Declarative', 'Programming', 'Scripting'],
      'Security & Identity': ['Governance', 'Identity', 'Security'],
    },
    'Data': {
      'Databases': ['MySQL', 'SQL', 'PostgreSQL'],
      'Analytics': ['Fabric'],
    },
    'Infra': {
      'Compute': ['Virtual Machine', 'Containers', 'Serverless Compute', 'Specialized Compute'],
      'Storage': ['Blob Storage', 'File and Disk Storage', 'Data Migration'],
      'Networking': ['Core Networking', 'Hybrid Networking', 'Load Balancing and Delivery', 'Network Security'],
    },
    'Soft Skills': {},
  },

  /**
   * Aliases for top-level category names.
   * Production may use different names than seed.sql.
   * Key = alternative name found in production, Value = canonical name in categoryTree.
   */
  topLevelAliases: {
    'Infrastructure': 'Infra',
  },

  /**
   * Skill name → category path mapping.
   * Paths use "/" separator: "L1/L2/L3" or "L1/L2" for level-2 leaf categories.
   * Resolved to database IDs at runtime by walking the category tree.
   */
  skillCategoryMap: {
    // === Apps & AI > Agentic AI > Development Tools ===
    'GitHub Copilot': 'Apps & AI/Agentic AI/Development Tools',
    'GitHub Copilot CLI': 'Apps & AI/Agentic AI/Development Tools',

    // === Apps & AI > Agentic AI > Framework ===
    'Microsoft Agent Framework': 'Apps & AI/Agentic AI/Framework',
    'Model Context Protocol (MCP)': 'Apps & AI/Agentic AI/Framework',

    // === Apps & AI > Agentic AI > Solution ===
    'Azure SRE Agent': 'Apps & AI/Agentic AI/Solution',
    'Microsoft 365 Copilot': 'Apps & AI/Agentic AI/Solution',
    'Microsoft Copilot Studio': 'Apps & AI/Agentic AI/Solution',
    'Microsoft Foundry Agent Service': 'Apps & AI/Agentic AI/Solution',

    // === Apps & AI > AI & Machine Learning > Fundamentals: Computer Vision ===
    'Image Classification': 'Apps & AI/AI & Machine Learning/Fundamentals: Computer Vision',
    'Image Segmentation': 'Apps & AI/AI & Machine Learning/Fundamentals: Computer Vision',
    'Object Detection': 'Apps & AI/AI & Machine Learning/Fundamentals: Computer Vision',

    // === Apps & AI > AI & Machine Learning > Fundamentals: LLMs ===
    'Prompt Engineering': 'Apps & AI/AI & Machine Learning/Fundamentals: Large Language Models (LLMs)',
    'Retrieval-Augmented Generation (RAG)': 'Apps & AI/AI & Machine Learning/Fundamentals: Large Language Models (LLMs)',
    'RAG Patterns': 'Apps & AI/AI & Machine Learning/Fundamentals: Large Language Models (LLMs)',
    'Supervised Fine-Tuning': 'Apps & AI/AI & Machine Learning/Fundamentals: Large Language Models (LLMs)',

    // === Apps & AI > AI & Machine Learning > Fundamentals: Security ===
    'Responsible AI': 'Apps & AI/AI & Machine Learning/Fundamentals: Security',

    // === Apps & AI > AI & Machine Learning > Solution ===
    'Azure AI Anomaly Detector': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Bot Service': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure Bot Service': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Content Safety': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Custom Vision': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Face': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Search': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Services (OpenAI)': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure OpenAI Service': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Video Indexer': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure Document Intelligence': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Document Intelligence': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure Language': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Language': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure Machine Learning': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure Speech': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Speech': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure Vision': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Vision': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Translator': 'Apps & AI/AI & Machine Learning/Solution',
    'Microsoft Foundry': 'Apps & AI/AI & Machine Learning/Solution',
    'Azure AI Foundry': 'Apps & AI/AI & Machine Learning/Solution',

    // === Apps & AI > Application Development ===
    'Infrastructure as Code (IaC)': 'Apps & AI/Application Development/Fundamentals',
    'Redis': 'Apps & AI/Application Development/Solution',
    'Azure Functions': 'Apps & AI/Application Development/Solution',
    'Azure Functions Durable': 'Apps & AI/Application Development/Solution',
    'Azure Logic Apps': 'Apps & AI/Application Development/Solution',
    'Unit Testing': 'Apps & AI/Application Development/Best Practices',
    'Playwright': 'Apps & AI/Application Development/Framework',
    'Git': 'Apps & AI/Application Development/Framework',

    // === Apps & AI > Containers > Solution ===
    'Azure App Configuration': 'Apps & AI/Containers/Solution',
    'Azure Container Apps': 'Apps & AI/Containers/Solution',
    'Azure Container Instance': 'Apps & AI/Containers/Solution',
    'Azure Container Registry': 'Apps & AI/Containers/Solution',
    'Azure Kubernetes Service (AKS)': 'Apps & AI/Containers/Solution',
    'Azure Red Hat OpenShift': 'Apps & AI/Containers/Solution',

    // === Apps & AI > DevOps ===
    'Azure Pipelines (Azure DevOps Pipelines)': 'Apps & AI/DevOps/CI/CD',
    'Azure Pipelines': 'Apps & AI/DevOps/CI/CD',
    'GitHub Actions': 'Apps & AI/DevOps/CI/CD',
    'Azure DevOps': 'Apps & AI/DevOps/Platform',
    'GitHub': 'Apps & AI/DevOps/Platform',

    // === Apps & AI > Messaging & Event Streaming ===
    'Apache Kafka': 'Apps & AI/Messaging & Event Streaming',
    'Azure Event Grid': 'Apps & AI/Messaging & Event Streaming',
    'Azure Event Hubs': 'Apps & AI/Messaging & Event Streaming',
    'Azure Service Bus': 'Apps & AI/Messaging & Event Streaming',

    // === Apps & AI > Monitoring & Observability ===
    'Azure Application Insights': 'Apps & AI/Monitoring & Observability',
    'Application Insights': 'Apps & AI/Monitoring & Observability',
    'Azure Monitor': 'Apps & AI/Monitoring & Observability',
    'Elasticsearch': 'Apps & AI/Monitoring & Observability',
    'Azure Advisor': 'Apps & AI/Monitoring & Observability',

    // === Apps & AI > Networking > Solution ===
    'Azure API Management': 'Apps & AI/Networking/Solution',
    'Azure Application Gateway': 'Apps & AI/Networking/Solution',
    'Azure Bastion': 'Apps & AI/Networking/Solution',
    'Azure Front Door': 'Apps & AI/Networking/Solution',
    'Azure Private Endpoint': 'Apps & AI/Networking/Solution',
    'Azure Virtual Network (VNet)': 'Apps & AI/Networking/Solution',

    // === Apps & AI > Programming Languages ===
    'Bicep': 'Apps & AI/Programming Languages/Declarative',
    'Terraform': 'Apps & AI/Programming Languages/Declarative',
    'C# / .NET': 'Apps & AI/Programming Languages/Programming',
    'Go': 'Apps & AI/Programming Languages/Programming',
    'Java': 'Apps & AI/Programming Languages/Programming',
    'JavaScript / TypeScript': 'Apps & AI/Programming Languages/Programming',
    'Python': 'Apps & AI/Programming Languages/Programming',
    'Bash / Shell': 'Apps & AI/Programming Languages/Scripting',
    'PowerShell': 'Apps & AI/Programming Languages/Scripting',

    // === Apps & AI > Security & Identity ===
    'Azure Policy': 'Apps & AI/Security & Identity/Governance',
    'Microsoft Entra ID': 'Apps & AI/Security & Identity/Identity',
    'Azure Key Vault': 'Apps & AI/Security & Identity/Security',
    'Microsoft Sentinel': 'Apps & AI/Security & Identity/Security',

    // === Data > Databases ===
    'Azure MySQL': 'Data/Databases/MySQL',
    'SQL MI': 'Data/Databases/SQL',
    'SQL DB': 'Data/Databases/SQL',
    'SQL on VMs': 'Data/Databases/SQL',
    'SQL DB Hyperscale': 'Data/Databases/SQL',
    'DB for PostgreSQL': 'Data/Databases/PostgreSQL',
    'Horizon DB': 'Data/Databases/PostgreSQL',
    'CosmosDB': 'Data/Databases',
    'Oracle Database @Azure': 'Data/Databases',
    'Document DB': 'Data/Databases',
    'Azure Arc': 'Data/Databases',
    'Cache for Redis': 'Data/Databases',
    'Managed Redis': 'Data/Databases',
    'Manged Redis': 'Data/Databases',

    // === Data > Analytics ===
    'Analysis Services': 'Data/Analytics',
    'Power BI Embedded': 'Data/Analytics',
    'Event Hubs': 'Data/Analytics',
    'Log Analytics Workspace': 'Data/Analytics',
    'Synapse Analytics Serverless': 'Data/Analytics',
    'Synapse Analytics Dedicated Pools': 'Data/Analytics',
    'Azure Data Factory': 'Data/Analytics',

    // === Data > Analytics > Fabric ===
    'Power BI': 'Data/Analytics/Fabric',
    'OneLake': 'Data/Analytics/Fabric',
    'Cosmos DB on Fabric': 'Data/Analytics/Fabric',
    // Broad conceptual skill — intentionally NOT Fabric-specific
    'Data Engineering and Data Science': 'Data/Analytics',
    'Data Factory': 'Data/Analytics/Fabric',
    'Data Warehouse': 'Data/Analytics/Fabric',
    'Fabric Admin, governance, and security': 'Data/Analytics/Fabric',
    'Fabric Purview integration': 'Data/Analytics/Fabric',
    'Real Time Intelligence': 'Data/Analytics/Fabric',
    'Fabric IQ': 'Data/Analytics/Fabric',
    'Fabric Data Engineering': 'Data/Analytics/Fabric',
    'Fabric Data Science': 'Data/Analytics/Fabric',
    'MySQL DB on Fabric': 'Data/Analytics/Fabric',
    'PostgreSQL on Fabric': 'Data/Analytics/Fabric',
    'SQL DB on Fabric': 'Data/Analytics/Fabric',
    'Fabric Capacity Management': 'Data/Analytics/Fabric',
    'Fabric OneLake': 'Data/Analytics/Fabric',
    // Keep this categorized, but do not auto-normalize it into the broad conceptual skill.
    'Fabric Data Engineering and Data Science': 'Data/Analytics/Fabric',
    'Fabric Data Factory': 'Data/Analytics/Fabric',
    'Fabric Data Warehouse': 'Data/Analytics/Fabric',
    'Fabric Real Time Intelligence': 'Data/Analytics/Fabric',
    'Fabric Real-Time Intelligence': 'Data/Analytics/Fabric',

    // === Infra > Compute > Virtual Machine ===
    'VM Sizes': 'Infra/Compute/Virtual Machine',
    'Availability Sets/Zones': 'Infra/Compute/Virtual Machine',
    'ScaleSets': 'Infra/Compute/Virtual Machine',
    'Spot VMs': 'Infra/Compute/Virtual Machine',
    'Dedicated Hosts': 'Infra/Compute/Virtual Machine',
    'Dedicatd Hosts': 'Infra/Compute/Virtual Machine',

    // === Infra > Compute > Containers ===
    'AKS': 'Infra/Compute/Containers',
    'Azure Container Instances': 'Infra/Compute/Containers',
    'Container Registry': 'Infra/Compute/Containers',

    // === Infra > Compute > Serverless Compute ===
    'App Service': 'Infra/Compute/Serverless Compute',
    'Azure App Service': 'Infra/Compute/Serverless Compute',
    'Static WebApps': 'Infra/Compute/Serverless Compute',

    // === Infra > Compute > Specialized Compute ===
    'Azure Batch': 'Infra/Compute/Specialized Compute',
    'Azure VMWare Solution': 'Infra/Compute/Specialized Compute',
    'Azure VMware Solution': 'Infra/Compute/Specialized Compute',
    'HPC': 'Infra/Compute/Specialized Compute',
    'Azure Service Fabric': 'Infra/Compute/Specialized Compute',

    // === Infra > Storage ===
    'Azure Backup': 'Infra/Storage',
    'Access Tiers': 'Infra/Storage/Blob Storage',
    'Lifecycle Management': 'Infra/Storage/Blob Storage',
    'Object Replication': 'Infra/Storage/Blob Storage',
    'Immutable Storage': 'Infra/Storage/Blob Storage',
    'Azure Files': 'Infra/Storage/File and Disk Storage',
    'Managed Disks': 'Infra/Storage/File and Disk Storage',
    'File Sync': 'Infra/Storage/File and Disk Storage',
    'Elastic SAN': 'Infra/Storage/File and Disk Storage',
    'AzCopy': 'Infra/Storage/Data Migration',
    'Storage Explorer': 'Infra/Storage/Data Migration',
    'Data Box': 'Infra/Storage/Data Migration',
    'Storage Mover': 'Infra/Storage/Data Migration',

    // === Infra > Networking ===
    'Virtual Networks': 'Infra/Networking/Core Networking',
    'IP Addressing': 'Infra/Networking/Core Networking',
    'vNET Peering': 'Infra/Networking/Core Networking',
    'NSGs/ASG': 'Infra/Networking/Core Networking',
    'Azure DNS': 'Infra/Networking/Core Networking',
    'VPN Gateways': 'Infra/Networking/Hybrid Networking',
    'Express Route': 'Infra/Networking/Hybrid Networking',
    'ExpressRoute': 'Infra/Networking/Hybrid Networking',
    'Virtual WAN': 'Infra/Networking/Hybrid Networking',
    'Bastion': 'Infra/Networking/Hybrid Networking',
    'Load Balancers': 'Infra/Networking/Load Balancing and Delivery',
    'App Gateway': 'Infra/Networking/Load Balancing and Delivery',
    'Front Door': 'Infra/Networking/Load Balancing and Delivery',
    'Traffic Manager': 'Infra/Networking/Load Balancing and Delivery',
    'Azure CDN': 'Infra/Networking/Load Balancing and Delivery',
    'Azure Firewall': 'Infra/Networking/Network Security',
    'DDoS Protection': 'Infra/Networking/Network Security',
    'Private Link': 'Infra/Networking/Network Security',
    'Network Watcher': 'Infra/Networking/Network Security',

    // === Soft Skills ===
    'Technical Presentations': 'Soft Skills',
    'Whiteboarding': 'Soft Skills',
    'Customer Discovery': 'Soft Skills',
    'Solution Architecture': 'Soft Skills',
    'Proof of Concept Delivery': 'Soft Skills',
    'Workshop Facilitation': 'Soft Skills',
    'Executive Briefings': 'Soft Skills',
    'Technical Writing': 'Soft Skills',
  },

  /**
   * Canonical metadata for skill display/governance.
   * `name` remains the stable DB identity; `preferredLabel` is what the UI should show.
   */
  skillMetadata: {
    'Azure AI Bot Service': {
      preferredLabel: 'Azure AI Bot Service',
      conceptType: 'product',
      lifecycleStatus: 'legacy',
      vendorNamespace: 'Azure AI',
    },
    'Azure Application Insights': {
      preferredLabel: 'Azure Monitor Application Insights',
      conceptType: 'product',
      lifecycleStatus: 'active',
      vendorNamespace: 'Azure Monitor',
    },
    'Managed Redis': {
      preferredLabel: 'Azure Managed Redis',
      conceptType: 'product',
      lifecycleStatus: 'active',
      vendorNamespace: 'Azure',
    },
    'Microsoft Foundry': {
      preferredLabel: 'Microsoft Foundry',
      conceptType: 'platform',
      lifecycleStatus: 'active',
      vendorNamespace: 'Microsoft',
    },
    'OneLake': {
      preferredLabel: 'OneLake',
      conceptType: 'product',
      lifecycleStatus: 'active',
      vendorNamespace: 'Microsoft Fabric',
    },
    'Data Engineering and Data Science': {
      preferredLabel: 'Data Engineering and Data Science',
      conceptType: 'practice',
      lifecycleStatus: 'active',
      vendorNamespace: null,
    },
    'Data Factory': {
      preferredLabel: 'Fabric Data Factory',
      conceptType: 'product',
      lifecycleStatus: 'active',
      vendorNamespace: 'Microsoft Fabric',
    },
    'Data Warehouse': {
      preferredLabel: 'Fabric Data Warehouse',
      conceptType: 'product',
      lifecycleStatus: 'active',
      vendorNamespace: 'Microsoft Fabric',
    },
    'Real Time Intelligence': {
      preferredLabel: 'Fabric Real-Time Intelligence',
      conceptType: 'product',
      lifecycleStatus: 'active',
      vendorNamespace: 'Microsoft Fabric',
    },
    'Fabric Data Engineering': {
      preferredLabel: 'Fabric Data Engineering',
      conceptType: 'product',
      lifecycleStatus: 'active',
      vendorNamespace: 'Microsoft Fabric',
    },
    'Fabric Data Science': {
      preferredLabel: 'Fabric Data Science',
      conceptType: 'product',
      lifecycleStatus: 'active',
      vendorNamespace: 'Microsoft Fabric',
    },
  },

  /**
   * Raw labels that should be surfaced for human review instead of silently merged.
   */
  reviewRequired: {
    'Fabric Data Engineering and Data Science': {
      suggestedAction: 'split',
      confidence: 0.25,
      reviewNotes: 'Combined Fabric workload label is ambiguous. Keep the broad conceptual skill separate and prefer the official Microsoft names "Fabric Data Engineering" and "Fabric Data Science".',
    },
  },

  /**
   * Name aliases: maps non-canonical names to their canonical form.
   * Used by normalizeSkillName() and migration dedup.
   */
  aliases: {
    // Excel pivot dedup suffixes
    'Azure Container Apps2': 'Azure Container Apps',
    'Azure Functions3': 'Azure Functions',
    'Azure Firewall4': 'Azure Firewall',
    'C%23 / .NET': 'C# / .NET',
    // Fabric prefixed variants
    'Fabric OneLake': 'OneLake',
    'Fabric Data Factory': 'Data Factory',
    'Fabric Data Warehouse': 'Data Warehouse',
    'Fabric Real Time Intelligence': 'Real Time Intelligence',
    'Fabric Real-Time Intelligence': 'Real Time Intelligence',
    // SharePoint-vs-seed name mismatches
    'Azure AI Document Intelligence': 'Azure Document Intelligence',
    'Azure AI Vision': 'Azure Vision',
    'Azure Bot Service': 'Azure AI Bot Service',
    'Azure OpenAI Service': 'Azure AI Services (OpenAI)',
    'RAG Patterns': 'Retrieval-Augmented Generation (RAG)',
    'Azure AI Language': 'Azure Language',
    'Azure AI Speech': 'Azure Speech',
    'Azure AI Foundry': 'Microsoft Foundry',
    'Application Insights': 'Azure Application Insights',
    'Azure Pipelines': 'Azure Pipelines (Azure DevOps Pipelines)',
    'Azure App Service': 'App Service',
    'Azure VMware Solution': 'Azure VMWare Solution',
    'Azure Managed Redis': 'Managed Redis',
    'ExpressRoute': 'Express Route',
    // Typos found in production data
    'Dedicatd Hosts': 'Dedicated Hosts',
    'Manged Redis': 'Managed Redis',
  },

  /**
   * Soft skills list (for backward compat with ensureSoftSkills).
   */
  softSkills: [
    'Technical Presentations',
    'Whiteboarding',
    'Customer Discovery',
    'Solution Architecture',
    'Proof of Concept Delivery',
    'Workshop Facilitation',
    'Executive Briefings',
    'Technical Writing',
  ],
};
