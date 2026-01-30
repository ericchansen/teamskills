-- Seed data for Team Skills Tracker
-- Demo data with fictional team members
-- To load your real team data, use: database/seed-team.sql (not in source control)

-- ============================================
-- SKILL CATEGORIES - SE Specializations
-- 3 groupings: Data, Infrastructure, Apps & AI
-- Plus: Soft Skills (cross-cutting)
-- ============================================
INSERT INTO skill_categories (name, description) VALUES
('Apps & AI', 'Application development, containers, serverless, AI/ML, and generative AI'),
('Data', 'Databases, analytics, data platforms, and business intelligence'),
('Infrastructure', 'VMs, networking, hybrid cloud, security, and management'),
('Soft Skills', 'Communication, presentation, and interpersonal skills');

-- ============================================
-- SKILLS - Apps & AI
-- ============================================
INSERT INTO skills (name, category_id, description) VALUES
-- App Platforms
('Azure App Service', 1, 'PaaS for web apps, APIs, and mobile backends'),
('Azure Functions', 1, 'Serverless event-driven compute'),
('Azure Container Apps', 1, 'Serverless containers with built-in scaling'),
('Azure Kubernetes Service (AKS)', 1, 'Managed Kubernetes container orchestration'),
('Azure Container Instances', 1, 'Fast, simple container deployment'),
('Azure Service Fabric', 1, 'Distributed systems platform for microservices'),
('Azure Red Hat OpenShift', 1, 'Managed OpenShift container platform'),
-- Integration
('Azure API Management', 1, 'Full lifecycle API management'),
('Azure Logic Apps', 1, 'Workflow automation and integration'),
('Azure Service Bus', 1, 'Enterprise messaging and queuing'),
('Azure Event Grid', 1, 'Event-driven architectures'),
('Azure Event Hubs', 1, 'Big data streaming and event ingestion'),
('Azure Functions Durable', 1, 'Stateful serverless workflows'),
('Power Automate', 1, 'Low-code workflow automation'),
-- AI & ML
('Azure OpenAI Service', 1, 'GPT models and generative AI'),
('Azure AI Foundry', 1, 'Unified platform for building AI applications'),
('Azure Machine Learning', 1, 'End-to-end ML platform'),
('Azure AI Search', 1, 'AI-powered search with vector and semantic capabilities'),
('Azure AI Document Intelligence', 1, 'Extract structured data from documents'),
('Azure AI Language', 1, 'NLP for sentiment, key phrases, and entities'),
('Azure AI Vision', 1, 'Image and video analysis'),
('Azure AI Speech', 1, 'Speech-to-text and text-to-speech'),
('Azure AI Translator', 1, 'Real-time translation'),
('Azure AI Content Safety', 1, 'Content moderation and safety'),
('Azure Bot Service', 1, 'Intelligent bot development'),
('Copilot Studio', 1, 'Low-code AI assistant builder'),
('Semantic Kernel', 1, 'AI orchestration SDK'),
('RAG Patterns', 1, 'Retrieval-augmented generation architectures'),
('Prompt Engineering', 1, 'Designing effective AI prompts'),
-- DevOps & Development
('GitHub Actions', 1, 'CI/CD workflows'),
('GitHub Copilot', 1, 'AI pair programming'),
('Azure DevOps', 1, 'DevOps platform with repos, boards, pipelines'),
('Azure Pipelines', 1, 'CI/CD pipelines'),
('Bicep', 1, 'Azure-native infrastructure as code'),
('Terraform', 1, 'Multi-cloud infrastructure as code'),
('Azure Monitor', 1, 'Full-stack monitoring'),
('Application Insights', 1, 'APM and diagnostics'),
-- Languages & Frameworks
('C# / .NET', 1, 'Microsoft development stack'),
('Python', 1, 'Data science and scripting'),
('JavaScript / TypeScript', 1, 'Web and Node.js development'),
('Java', 1, 'Enterprise development'),
('Go', 1, 'Cloud-native development'),
('React', 1, 'Frontend framework'),
('Node.js', 1, 'Server-side JavaScript'),
('PowerShell', 1, 'Scripting and automation'),
('SQL', 1, 'Database query language');

-- ============================================
-- SKILLS - Data
-- ============================================
INSERT INTO skills (name, category_id, description) VALUES
-- Databases
('Azure SQL Database', 2, 'Managed relational database service'),
('Azure Cosmos DB', 2, 'Globally distributed multi-model NoSQL database'),
('Azure Database for PostgreSQL', 2, 'Managed PostgreSQL database'),
('Azure Database for MySQL', 2, 'Managed MySQL database'),
('Azure Cache for Redis', 2, 'In-memory data store for caching'),
-- Analytics
('Azure Synapse Analytics', 2, 'Unified analytics and data warehousing'),
('Azure Data Factory', 2, 'Data integration and ETL/ELT pipelines'),
('Azure Databricks', 2, 'Apache Spark-based analytics platform'),
('Azure Data Lake Storage', 2, 'Scalable data lake for big data analytics'),
('Azure Stream Analytics', 2, 'Real-time analytics on streaming data'),
('Azure Data Explorer', 2, 'Fast, scalable data exploration service'),
('Microsoft Fabric', 2, 'Unified analytics platform'),
('Power BI', 2, 'Business intelligence and visualization');

-- ============================================
-- SKILLS - Infrastructure
-- ============================================
INSERT INTO skills (name, category_id, description) VALUES
-- Compute
('Azure Virtual Machines', 3, 'IaaS compute for Windows and Linux VMs'),
('Azure Virtual Machine Scale Sets', 3, 'Auto-scaling VM deployments'),
('Azure Batch', 3, 'Large-scale parallel and HPC batch jobs'),
-- Networking
('Azure Virtual Network', 3, 'Private network in Azure'),
('Azure Load Balancer', 3, 'Layer 4 load balancing'),
('Azure Application Gateway', 3, 'Layer 7 load balancing and WAF'),
('Azure Front Door', 3, 'Global load balancing and CDN'),
('Azure CDN', 3, 'Content delivery network'),
('Azure DNS', 3, 'DNS hosting and management'),
('Azure Traffic Manager', 3, 'DNS-based traffic routing'),
('Azure ExpressRoute', 3, 'Private connection to Azure'),
('Azure VPN Gateway', 3, 'Site-to-site and point-to-site VPN'),
('Azure Virtual WAN', 3, 'Network hub for hybrid connectivity'),
('Azure Bastion', 3, 'Secure VM access without public IP'),
('Azure Private Link', 3, 'Private access to Azure services'),
('Azure Firewall', 3, 'Cloud-native network security'),
('Azure DDoS Protection', 3, 'DDoS mitigation'),
-- Security
('Microsoft Entra ID', 3, 'Identity and access management'),
('Microsoft Defender for Cloud', 3, 'Cloud security posture management'),
('Microsoft Sentinel', 3, 'SIEM and SOAR'),
('Azure Key Vault', 3, 'Secrets and key management'),
('Azure Policy', 3, 'Governance and compliance'),
('Microsoft Purview', 3, 'Data governance and compliance'),
-- Management
('Azure Resource Manager', 3, 'Resource deployment and management'),
('ARM Templates', 3, 'Azure Resource Manager templates'),
('Azure Arc', 3, 'Hybrid and multi-cloud management'),
('Azure Migrate', 3, 'Migration assessment and execution'),
('Azure Site Recovery', 3, 'Disaster recovery orchestration'),
('Azure Backup', 3, 'Backup and recovery services'),
('Azure Cost Management', 3, 'Cost monitoring and optimization'),
('Azure Advisor', 3, 'Best practices recommendations'),
('Azure Local', 3, 'Azure Stack HCI and edge'),
('Azure Log Analytics', 3, 'Log collection and analysis');

-- ============================================
-- SKILLS - Soft Skills
-- ============================================
INSERT INTO skills (name, category_id, description) VALUES
('Technical Presentations', 4, 'Delivering technical content to audiences'),
('Whiteboarding', 4, 'Visual communication and architecture design'),
('Customer Discovery', 4, 'Understanding customer needs and pain points'),
('Solution Architecture', 4, 'Designing end-to-end solutions'),
('Proof of Concept Delivery', 4, 'Building and presenting POCs'),
('Workshop Facilitation', 4, 'Running interactive technical workshops'),
('Executive Briefings', 4, 'Presenting to senior leadership'),
('Technical Writing', 4, 'Documentation and technical content');

-- ============================================
-- USERS - Demo Team (fictional names)
-- ============================================
INSERT INTO users (name, email, role, team) VALUES
('Alex Chen', 'alex.chen@example.com', 'Engineering Manager', 'Demo Team'),
('Jordan Rivera', 'jordan.rivera@example.com', 'Principal Engineer', 'Demo Team'),
('Morgan Taylor', 'morgan.taylor@example.com', 'Principal Engineer', 'Demo Team'),
('Casey Kim', 'casey.kim@example.com', 'Principal Engineer', 'Demo Team'),
('Riley Johnson', 'riley.johnson@example.com', 'Senior Engineer', 'Demo Team'),
('Avery Williams', 'avery.williams@example.com', 'Senior Engineer', 'Demo Team'),
('Quinn Davis', 'quinn.davis@example.com', 'Senior Engineer', 'Demo Team'),
('Drew Martinez', 'drew.martinez@example.com', 'Senior Engineer', 'Demo Team'),
('Jamie Lee', 'jamie.lee@example.com', 'Senior Engineer', 'Demo Team'),
('Sam Patel', 'sam.patel@example.com', 'Senior Engineer', 'Demo Team'),
('Taylor Brown', 'taylor.brown@example.com', 'Senior Engineer', 'Demo Team'),
('Jordan Smith', 'jordan.smith@example.com', 'Engineer', 'Demo Team'),
('Chris Anderson', 'chris.anderson@example.com', 'Senior Engineer', 'Demo Team'),
('Pat Wilson', 'pat.wilson@example.com', 'Senior Engineer', 'Demo Team');

-- ============================================
-- USER SKILLS - Demo data with fictional names
-- ============================================

-- Alex Chen (Manager) - Broad expertise, leadership focus
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Alex Chen', 'Proof of Concept Delivery', 'L400', 'Team leadership'),
  ('Alex Chen', 'Solution Architecture', 'L400', 'Solution architecture leadership'),
  ('Alex Chen', 'Executive Briefings', 'L400', 'Executive-level presentations'),
  ('Alex Chen', 'Microsoft Entra ID', 'L400', 'Deep Entra ID expertise'),
  ('Alex Chen', 'Azure OpenAI Service', 'L300', 'Azure OpenAI implementations'),
  ('Alex Chen', 'Azure AI Foundry', 'L300', 'AI Foundry experience'),
  ('Alex Chen', 'Azure SQL Database', 'L300', 'Azure SQL expertise'),
  ('Alex Chen', 'Azure Virtual Network', 'L300', 'Networking')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Jordan Rivera (Principal) - AI and Data focus
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Jordan Rivera', 'Azure OpenAI Service', 'L400', 'Azure OpenAI expert'),
  ('Jordan Rivera', 'Azure Machine Learning', 'L400', 'Azure ML specialist'),
  ('Jordan Rivera', 'Azure AI Foundry', 'L400', 'AI Foundry architecture'),
  ('Jordan Rivera', 'Azure AI Search', 'L400', 'AI Search and RAG patterns'),
  ('Jordan Rivera', 'RAG Patterns', 'L400', 'RAG architecture expert'),
  ('Jordan Rivera', 'Semantic Kernel', 'L300', 'Semantic Kernel development'),
  ('Jordan Rivera', 'Azure Cosmos DB', 'L300', 'Cosmos DB for AI workloads'),
  ('Jordan Rivera', 'Azure Databricks', 'L300', 'Databricks and analytics'),
  ('Jordan Rivera', 'Solution Architecture', 'L400', 'Solution architecture'),
  ('Jordan Rivera', 'Python', 'L300', 'Python development')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Morgan Taylor (Principal) - Infrastructure and Networking
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Morgan Taylor', 'Azure Virtual Network', 'L400', 'Azure networking expert'),
  ('Morgan Taylor', 'Azure ExpressRoute', 'L400', 'ExpressRoute specialist'),
  ('Morgan Taylor', 'Azure VPN Gateway', 'L400', 'VPN Gateway expert'),
  ('Morgan Taylor', 'Azure Front Door', 'L400', 'Azure Front Door'),
  ('Morgan Taylor', 'Azure Virtual Machines', 'L400', 'Azure VMs and infrastructure'),
  ('Morgan Taylor', 'Azure Arc', 'L400', 'Azure Arc hybrid cloud'),
  ('Morgan Taylor', 'Azure Local', 'L400', 'Azure Local/Stack'),
  ('Morgan Taylor', 'Azure Bastion', 'L300', 'Azure Bastion'),
  ('Morgan Taylor', 'Bicep', 'L300', 'Bicep/ARM templates'),
  ('Morgan Taylor', 'PowerShell', 'L400', 'PowerShell automation')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Casey Kim (Principal) - Security and Identity
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Casey Kim', 'Microsoft Entra ID', 'L400', 'Entra ID architecture expert'),
  ('Casey Kim', 'Azure Key Vault', 'L400', 'Key Vault specialist'),
  ('Casey Kim', 'Microsoft Defender for Cloud', 'L400', 'Defender for Cloud'),
  ('Casey Kim', 'Microsoft Sentinel', 'L400', 'Microsoft Sentinel SIEM'),
  ('Casey Kim', 'Azure Policy', 'L400', 'Azure Policy governance'),
  ('Casey Kim', 'Microsoft Purview', 'L300', 'Microsoft Purview'),
  ('Casey Kim', 'Azure Firewall', 'L300', 'Azure Firewall'),
  ('Casey Kim', 'Solution Architecture', 'L400', 'Security architecture'),
  ('Casey Kim', 'Financial Services', 'L300', 'Financial services')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Riley Johnson (Senior) - Modern App Development
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Riley Johnson', 'Azure Kubernetes Service (AKS)', 'L300', 'AKS deployments'),
  ('Riley Johnson', 'Azure Container Apps', 'L300', 'Container Apps'),
  ('Riley Johnson', 'Azure Functions', 'L300', 'Azure Functions'),
  ('Riley Johnson', 'GitHub Actions', 'L300', 'GitHub Actions'),
  ('Riley Johnson', 'GitHub Copilot', 'L200', 'GitHub Copilot'),
  ('Riley Johnson', 'Azure Monitor', 'L200', 'Azure Monitor'),
  ('Riley Johnson', 'JavaScript / TypeScript', 'L300', 'JavaScript/TypeScript'),
  ('Riley Johnson', 'Proof of Concept Delivery', 'L200', 'POC delivery')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Avery Williams (Senior) - Data and AI
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Avery Williams', 'Azure OpenAI Service', 'L400', 'Azure OpenAI expert'),
  ('Avery Williams', 'Azure AI Search', 'L300', 'AI Search implementations'),
  ('Avery Williams', 'Azure Machine Learning', 'L300', 'Azure ML'),
  ('Avery Williams', 'Azure Synapse Analytics', 'L300', 'Synapse Analytics'),
  ('Avery Williams', 'Azure Data Factory', 'L300', 'Data Factory pipelines'),
  ('Avery Williams', 'Azure Cosmos DB', 'L300', 'Cosmos DB'),
  ('Avery Williams', 'Prompt Engineering', 'L300', 'Prompt engineering'),
  ('Avery Williams', 'Python', 'L300', 'Python'),
  ('Avery Williams', 'Technical Presentations', 'L300', 'Technical presentations')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Quinn Davis (Senior) - Infrastructure and DevOps
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Quinn Davis', 'Azure Virtual Machines', 'L400', 'Azure VMs expert'),
  ('Quinn Davis', 'Azure Virtual Machine Scale Sets', 'L300', 'VM Scale Sets'),
  ('Quinn Davis', 'Azure DevOps', 'L400', 'Azure DevOps'),
  ('Quinn Davis', 'Azure Pipelines', 'L300', 'Azure Pipelines'),
  ('Quinn Davis', 'Terraform', 'L400', 'Terraform expert'),
  ('Quinn Davis', 'Bicep', 'L300', 'Bicep'),
  ('Quinn Davis', 'Azure Migrate', 'L300', 'Azure Migrate'),
  ('Quinn Davis', 'Azure Site Recovery', 'L300', 'Site Recovery'),
  ('Quinn Davis', 'PowerShell', 'L300', 'PowerShell')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Drew Martinez (Senior) - Cloud Architecture
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Drew Martinez', 'Azure App Service', 'L400', 'App Service expert'),
  ('Drew Martinez', 'Azure Functions', 'L300', 'Azure Functions'),
  ('Drew Martinez', 'Azure SQL Database', 'L300', 'Azure SQL'),
  ('Drew Martinez', 'Azure Cache for Redis', 'L300', 'Redis Cache'),
  ('Drew Martinez', 'Azure DevOps', 'L300', 'Azure DevOps'),
  ('Drew Martinez', 'Microsoft Entra ID', 'L300', 'Entra ID'),
  ('Drew Martinez', 'Solution Architecture', 'L300', 'Solution architecture'),
  ('Drew Martinez', 'C# / .NET', 'L300', 'C#/.NET'),
  ('Drew Martinez', 'Proof of Concept Delivery', 'L300', 'POC delivery')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Jamie Lee (Senior) - Integration and Messaging
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Jamie Lee', 'Azure Service Bus', 'L400', 'Service Bus expert'),
  ('Jamie Lee', 'Azure Event Hubs', 'L400', 'Event Hubs streaming'),
  ('Jamie Lee', 'Azure Event Grid', 'L300', 'Event Grid'),
  ('Jamie Lee', 'Azure Logic Apps', 'L300', 'Logic Apps'),
  ('Jamie Lee', 'Azure API Management', 'L300', 'API Management'),
  ('Jamie Lee', 'Azure Functions', 'L300', 'Azure Functions'),
  ('Jamie Lee', 'Azure Functions Durable', 'L300', 'Durable Functions'),
  ('Jamie Lee', 'Solution Architecture', 'L300', 'Integration architecture')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Sam Patel (Senior) - Data Platform
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Sam Patel', 'Azure SQL Database', 'L400', 'Azure SQL expert'),
  ('Sam Patel', 'Azure Synapse Analytics', 'L400', 'Synapse Analytics'),
  ('Sam Patel', 'Azure Databricks', 'L300', 'Databricks'),
  ('Sam Patel', 'Microsoft Fabric', 'L300', 'Microsoft Fabric'),
  ('Sam Patel', 'Power BI', 'L300', 'Power BI'),
  ('Sam Patel', 'Azure Data Factory', 'L300', 'Data Factory'),
  ('Sam Patel', 'Azure Data Lake Storage', 'L300', 'Data Lake Storage'),
  ('Sam Patel', 'SQL', 'L400', 'SQL expertise')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Taylor Brown (Senior) - AI and Customer Success
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Taylor Brown', 'Azure OpenAI Service', 'L300', 'Azure OpenAI'),
  ('Taylor Brown', 'Copilot Studio', 'L300', 'Copilot Studio'),
  ('Taylor Brown', 'Prompt Engineering', 'L300', 'Prompt engineering'),
  ('Taylor Brown', 'Azure AI Vision', 'L300', 'AI Vision'),
  ('Taylor Brown', 'Azure AI Speech', 'L300', 'AI Speech'),
  ('Taylor Brown', 'Technical Presentations', 'L400', 'Technical presentations'),
  ('Taylor Brown', 'Customer Discovery', 'L400', 'Customer discovery'),
  ('Taylor Brown', 'Workshop Facilitation', 'L300', 'Workshop facilitation')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Jordan Smith (Engineer) - Cloud Native
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Jordan Smith', 'Azure Kubernetes Service (AKS)', 'L300', 'AKS'),
  ('Jordan Smith', 'Azure Container Apps', 'L300', 'Container Apps'),
  ('Jordan Smith', 'Azure Container Instances', 'L200', 'Container Instances'),
  ('Jordan Smith', 'GitHub Actions', 'L300', 'GitHub Actions'),
  ('Jordan Smith', 'GitHub Copilot', 'L300', 'GitHub Copilot'),
  ('Jordan Smith', 'Terraform', 'L200', 'Terraform'),
  ('Jordan Smith', 'JavaScript / TypeScript', 'L300', 'TypeScript'),
  ('Jordan Smith', 'Go', 'L200', 'Go')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Chris Anderson (Senior) - AI and Development
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Chris Anderson', 'Azure OpenAI Service', 'L400', 'Azure OpenAI expert'),
  ('Chris Anderson', 'Azure AI Foundry', 'L300', 'AI Foundry'),
  ('Chris Anderson', 'Semantic Kernel', 'L300', 'Semantic Kernel'),
  ('Chris Anderson', 'RAG Patterns', 'L400', 'RAG patterns expert'),
  ('Chris Anderson', 'GitHub Copilot', 'L400', 'GitHub Copilot power user'),
  ('Chris Anderson', 'GitHub Actions', 'L300', 'GitHub Actions'),
  ('Chris Anderson', 'C# / .NET', 'L300', 'C#/.NET'),
  ('Chris Anderson', 'Python', 'L300', 'Python'),
  ('Chris Anderson', 'JavaScript / TypeScript', 'L100', 'Learning JavaScript/TypeScript'),
  ('Chris Anderson', 'React', 'L300', 'React'),
  ('Chris Anderson', 'Node.js', 'L300', 'Node.js'),
  ('Chris Anderson', 'Solution Architecture', 'L300', 'Solution architecture'),
  ('Chris Anderson', 'Proof of Concept Delivery', 'L300', 'POC delivery')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- Pat Wilson (Senior) - Modern Development
INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
SELECT u.id, s.id, level, note FROM 
(VALUES 
  ('Pat Wilson', 'Azure App Service', 'L400', 'App Service expert'),
  ('Pat Wilson', 'Azure Functions', 'L300', 'Azure Functions'),
  ('Pat Wilson', 'Azure Container Apps', 'L300', 'Container Apps'),
  ('Pat Wilson', 'Azure OpenAI Service', 'L300', 'Azure OpenAI'),
  ('Pat Wilson', 'Azure DevOps', 'L300', 'Azure DevOps'),
  ('Pat Wilson', 'Azure Monitor', 'L300', 'Azure Monitor'),
  ('Pat Wilson', 'C# / .NET', 'L400', 'C#/.NET expert'),
  ('Pat Wilson', 'JavaScript / TypeScript', 'L300', 'TypeScript'),
  ('Pat Wilson', 'Solution Architecture', 'L300', 'Solution architecture')
) AS t(user_name, skill_name, level, note)
JOIN users u ON u.name = t.user_name
JOIN skills s ON s.name = t.skill_name;

-- ============================================
-- SKILL RELATIONSHIPS - Using name lookups
-- ============================================
INSERT INTO skill_relationships (parent_skill_id, child_skill_id)
SELECT p.id, c.id FROM 
(VALUES 
  -- Data hierarchy
  ('Azure SQL Database', 'Azure Database for PostgreSQL'),
  ('Azure SQL Database', 'Azure Database for MySQL'),
  ('Azure Synapse Analytics', 'Azure Databricks'),
  ('Azure Synapse Analytics', 'Microsoft Fabric'),
  -- AI hierarchy
  ('Azure Machine Learning', 'Azure OpenAI Service'),
  ('Azure Machine Learning', 'Azure AI Search'),
  ('Azure AI Foundry', 'Azure OpenAI Service'),
  ('Azure AI Foundry', 'Azure Machine Learning'),
  ('Azure OpenAI Service', 'Prompt Engineering'),
  ('Azure AI Search', 'RAG Patterns'),
  -- Compute hierarchy
  ('Azure Kubernetes Service (AKS)', 'Azure Container Apps'),
  ('Azure Kubernetes Service (AKS)', 'Azure Container Instances'),
  -- DevOps hierarchy
  ('Azure DevOps', 'Azure Pipelines'),
  ('GitHub Actions', 'Azure Pipelines')
) AS t(parent_name, child_name)
JOIN skills p ON p.name = t.parent_name
JOIN skills c ON c.name = t.child_name;
