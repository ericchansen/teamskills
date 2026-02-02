const express = require('express');
const router = express.Router();
const db = require('../db');

// Database initialization endpoint (POST to prevent accidental execution)
router.post('/init', async (req, res) => {
  const { secret } = req.body;
  
  // Require INIT_SECRET environment variable for security
  const initSecret = process.env.INIT_SECRET;
  if (!initSecret || secret !== initSecret) {
    return res.status(401).json({ error: 'Unauthorized - INIT_SECRET required' });
  }

  try {
    // Check if tables already exist
    const tablesCheck = await db.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    
    if (parseInt(tablesCheck.rows[0].count) > 0) {
      // Tables exist - check if data exists
      const dataCheck = await db.query('SELECT COUNT(*) as count FROM users');
      if (parseInt(dataCheck.rows[0].count) > 0) {
        return res.json({ 
          message: 'Database already initialized', 
          users: parseInt(dataCheck.rows[0].count),
          status: 'skipped'
        });
      }
    }

    // Run schema
    const schemaSQL = `
      -- Team Skills Tracker Database Schema
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          role VARCHAR(100),
          team VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS skill_categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS skills (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          category_id INTEGER REFERENCES skill_categories(id) ON DELETE SET NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_skills (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
          proficiency_level VARCHAR(10) NOT NULL CHECK (proficiency_level IN ('L100', 'L200', 'L300', 'L400')),
          notes TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, skill_id)
      );

      CREATE TABLE IF NOT EXISTS skill_relationships (
          id SERIAL PRIMARY KEY,
          parent_skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
          child_skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
          relationship_type VARCHAR(50) DEFAULT 'parent-child',
          UNIQUE(parent_skill_id, child_skill_id),
          CHECK (parent_skill_id != child_skill_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_id);
      CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category_id);
      CREATE INDEX IF NOT EXISTS idx_skill_relationships_parent ON skill_relationships(parent_skill_id);
      CREATE INDEX IF NOT EXISTS idx_skill_relationships_child ON skill_relationships(child_skill_id);

      CREATE OR REPLACE FUNCTION update_user_skills_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.last_updated = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_user_skills_modtime ON user_skills;
      CREATE TRIGGER update_user_skills_modtime
          BEFORE UPDATE ON user_skills
          FOR EACH ROW
          EXECUTE FUNCTION update_user_skills_timestamp();

      CREATE OR REPLACE FUNCTION update_users_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_users_modtime ON users;
      CREATE TRIGGER update_users_modtime
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_users_timestamp();
    `;

    await db.query(schemaSQL);
    console.log('Schema created successfully');

    // Seed data for skill categories
    await db.query(`
      INSERT INTO skill_categories (name, description) VALUES
      ('Apps & AI', 'Application development, containers, serverless, AI/ML, and genertic AI'),
      ('Data', 'Databases, analytics, data platforms, and business intelligence'),
      ('Infrastructure', 'VMs, networking, hybrid cloud, security, and management'),
      ('Soft Skills', 'Communication, presentation, and interpersonal skills')
      ON CONFLICT DO NOTHING
    `);

    // Check if categories were inserted
    const catResult = await db.query('SELECT COUNT(*) as count FROM skill_categories');
    if (parseInt(catResult.rows[0].count) === 0) {
      await db.query(`
        INSERT INTO skill_categories (name, description) VALUES
        ('Apps & AI', 'Application development, containers, serverless, AI/ML, and genertic AI'),
        ('Data', 'Databases, analytics, data platforms, and business intelligence'),
        ('Infrastructure', 'VMs, networking, hybrid cloud, security, and management'),
        ('Soft Skills', 'Communication, presentation, and interpersonal skills')
      `);
    }

    // Seed skills - Apps & AI (category_id = 1)
    await db.query(`
      INSERT INTO skills (name, category_id, description) VALUES
      ('Azure App Service', 1, 'PaaS for web apps, APIs, and mobile backends'),
      ('Azure Functions', 1, 'Serverless event-driven compute'),
      ('Azure Container Apps', 1, 'Serverless containers with built-in scaling'),
      ('Azure Kubernetes Service (AKS)', 1, 'Managed Kubernetes container orchestration'),
      ('Azure Container Instances', 1, 'Fast, simple container deployment'),
      ('Azure Service Fabric', 1, 'Distributed systems platform for microservices'),
      ('Azure Red Hat OpenShift', 1, 'Managed OpenShift container platform'),
      ('Azure API Management', 1, 'Full lifecycle API management'),
      ('Azure Logic Apps', 1, 'Workflow automation and integration'),
      ('Azure Service Bus', 1, 'Enterprise messaging and queuing'),
      ('Azure Event Grid', 1, 'Event-driven architectures'),
      ('Azure Event Hubs', 1, 'Big data streaming and event ingestion'),
      ('Azure Functions Durable', 1, 'Stateful serverless workflows'),
      ('Power Automate', 1, 'Low-code workflow automation'),
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
      ('GitHub Actions', 1, 'CI/CD workflows'),
      ('GitHub Copilot', 1, 'AI pair programming'),
      ('Azure DevOps', 1, 'DevOps platform with repos, boards, pipelines'),
      ('Azure Pipelines', 1, 'CI/CD pipelines'),
      ('Bicep', 1, 'Azure-native infrastructure as code'),
      ('Terraform', 1, 'Multi-cloud infrastructure as code'),
      ('Azure Monitor', 1, 'Full-stack monitoring'),
      ('Application Insights', 1, 'APM and diagnostics'),
      ('C# / .NET', 1, 'Microsoft development stack'),
      ('Python', 1, 'Data science and scripting'),
      ('JavaScript / TypeScript', 1, 'Web and Node.js development'),
      ('Java', 1, 'Enterprise development'),
      ('Go', 1, 'Cloud-native development'),
      ('React', 1, 'Frontend framework'),
      ('Node.js', 1, 'Server-side JavaScript'),
      ('PowerShell', 1, 'Scripting and automation'),
      ('SQL', 1, 'Database query language')
      ON CONFLICT DO NOTHING
    `);

    // Seed skills - Data (category_id = 2)
    await db.query(`
      INSERT INTO skills (name, category_id, description) VALUES
      ('Azure SQL Database', 2, 'Managed relational database service'),
      ('Azure Cosmos DB', 2, 'Globally distributed multi-model NoSQL database'),
      ('Azure Database for PostgreSQL', 2, 'Managed PostgreSQL database'),
      ('Azure Database for MySQL', 2, 'Managed MySQL database'),
      ('Azure Cache for Redis', 2, 'In-memory data store for caching'),
      ('Azure Synapse Analytics', 2, 'Unified analytics and data warehousing'),
      ('Azure Data Factory', 2, 'Data integration and ETL/ELT pipelines'),
      ('Azure Databricks', 2, 'Apache Spark-based analytics platform'),
      ('Azure Data Lake Storage', 2, 'Scalable data lake for big data analytics'),
      ('Azure Stream Analytics', 2, 'Real-time analytics on streaming data'),
      ('Azure Data Explorer', 2, 'Fast, scalable data exploration service'),
      ('Microsoft Fabric', 2, 'Unified analytics platform'),
      ('Power BI', 2, 'Business intelligence and visualization')
      ON CONFLICT DO NOTHING
    `);

    // Seed skills - Infrastructure (category_id = 3)
    await db.query(`
      INSERT INTO skills (name, category_id, description) VALUES
      ('Azure Virtual Machines', 3, 'IaaS compute for Windows and Linux VMs'),
      ('Azure Virtual Machine Scale Sets', 3, 'Auto-scaling VM deployments'),
      ('Azure Batch', 3, 'Large-scale parallel and HPC batch jobs'),
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
      ('Microsoft Entra ID', 3, 'Identity and access management'),
      ('Microsoft Defender for Cloud', 3, 'Cloud security posture management'),
      ('Microsoft Sentinel', 3, 'SIEM and SOAR'),
      ('Azure Key Vault', 3, 'Secrets and key management'),
      ('Azure Policy', 3, 'Governance and compliance'),
      ('Microsoft Purview', 3, 'Data governance and compliance'),
      ('Azure Resource Manager', 3, 'Resource deployment and management'),
      ('ARM Templates', 3, 'Azure Resource Manager templates'),
      ('Azure Arc', 3, 'Hybrid and multi-cloud management'),
      ('Azure Migrate', 3, 'Migration assessment and execution'),
      ('Azure Site Recovery', 3, 'Disaster recovery orchestration'),
      ('Azure Backup', 3, 'Backup and recovery services'),
      ('Azure Cost Management', 3, 'Cost monitoring and optimization'),
      ('Azure Advisor', 3, 'Best practices recommendations'),
      ('Azure Local', 3, 'Azure Stack HCI and edge'),
      ('Azure Log Analytics', 3, 'Log collection and analysis')
      ON CONFLICT DO NOTHING
    `);

    // Seed skills - Soft Skills (category_id = 4)
    await db.query(`
      INSERT INTO skills (name, category_id, description) VALUES
      ('Technical Presentations', 4, 'Delivering technical content to audiences'),
      ('Whiteboarding', 4, 'Visual communication and architecture design'),
      ('Customer Discovery', 4, 'Understanding customer needs and pain points'),
      ('Solution Architecture', 4, 'Designing end-to-end solutions'),
      ('Proof of Concept Delivery', 4, 'Building and presenting POCs'),
      ('Workshop Facilitation', 4, 'Running interactive technical workshops'),
      ('Executive Briefings', 4, 'Presenting to senior leadership'),
      ('Technical Writing', 4, 'Documentation and technical content')
      ON CONFLICT DO NOTHING
    `);

    // Seed users - Demo team (fictional names)
    await db.query(`
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
      ('Pat Wilson', 'pat.wilson@example.com', 'Senior Engineer', 'Demo Team')
      ON CONFLICT (email) DO NOTHING
    `);

    // Seed user skills using subqueries to find IDs
    const userSkillsData = [
      // Alex Chen (Manager) - Broad expertise, leadership focus
      ['Alex Chen', 'Proof of Concept Delivery', 'L400'],
      ['Alex Chen', 'Solution Architecture', 'L400'],
      ['Alex Chen', 'Executive Briefings', 'L400'],
      ['Alex Chen', 'Microsoft Entra ID', 'L400'],
      ['Alex Chen', 'Azure OpenAI Service', 'L300'],
      ['Alex Chen', 'Azure AI Foundry', 'L300'],
      ['Alex Chen', 'Azure SQL Database', 'L300'],
      ['Alex Chen', 'Azure Virtual Network', 'L300'],
      // Jordan Rivera (Principal) - AI and Data focus
      ['Jordan Rivera', 'Azure OpenAI Service', 'L400'],
      ['Jordan Rivera', 'Azure Machine Learning', 'L400'],
      ['Jordan Rivera', 'Azure AI Foundry', 'L400'],
      ['Jordan Rivera', 'Azure AI Search', 'L400'],
      ['Jordan Rivera', 'RAG Patterns', 'L400'],
      ['Jordan Rivera', 'Semantic Kernel', 'L300'],
      ['Jordan Rivera', 'Azure Cosmos DB', 'L300'],
      ['Jordan Rivera', 'Azure Databricks', 'L300'],
      ['Jordan Rivera', 'Solution Architecture', 'L400'],
      ['Jordan Rivera', 'Python', 'L300'],
      // Morgan Taylor (Principal) - Infrastructure and Networking
      ['Morgan Taylor', 'Azure Virtual Network', 'L400'],
      ['Morgan Taylor', 'Azure ExpressRoute', 'L400'],
      ['Morgan Taylor', 'Azure VPN Gateway', 'L400'],
      ['Morgan Taylor', 'Azure Front Door', 'L400'],
      ['Morgan Taylor', 'Azure Virtual Machines', 'L400'],
      ['Morgan Taylor', 'Azure Arc', 'L400'],
      ['Morgan Taylor', 'Azure Local', 'L400'],
      ['Morgan Taylor', 'Azure Bastion', 'L300'],
      ['Morgan Taylor', 'Bicep', 'L300'],
      ['Morgan Taylor', 'PowerShell', 'L400'],
      // Casey Kim (Principal) - Security and Identity
      ['Casey Kim', 'Microsoft Entra ID', 'L400'],
      ['Casey Kim', 'Azure Key Vault', 'L400'],
      ['Casey Kim', 'Microsoft Defender for Cloud', 'L400'],
      ['Casey Kim', 'Microsoft Sentinel', 'L400'],
      ['Casey Kim', 'Azure Policy', 'L400'],
      ['Casey Kim', 'Microsoft Purview', 'L300'],
      ['Casey Kim', 'Azure Firewall', 'L300'],
      ['Casey Kim', 'Solution Architecture', 'L400'],
      // Riley Johnson (SE) - Modern App Development
      ['Riley Johnson', 'Azure Kubernetes Service (AKS)', 'L300'],
      ['Riley Johnson', 'Azure Container Apps', 'L300'],
      ['Riley Johnson', 'Azure Functions', 'L300'],
      ['Riley Johnson', 'GitHub Actions', 'L300'],
      ['Riley Johnson', 'GitHub Copilot', 'L200'],
      ['Riley Johnson', 'Azure Monitor', 'L200'],
      ['Riley Johnson', 'JavaScript / TypeScript', 'L300'],
      ['Riley Johnson', 'Proof of Concept Delivery', 'L200'],
      // Avery Williams (Senior SE) - Data and AI
      ['Avery Williams', 'Azure OpenAI Service', 'L400'],
      ['Avery Williams', 'Azure AI Search', 'L300'],
      ['Avery Williams', 'Azure Machine Learning', 'L300'],
      ['Avery Williams', 'Azure Synapse Analytics', 'L300'],
      ['Avery Williams', 'Azure Data Factory', 'L300'],
      ['Avery Williams', 'Azure Cosmos DB', 'L300'],
      ['Avery Williams', 'Prompt Engineering', 'L300'],
      ['Avery Williams', 'Python', 'L300'],
      ['Avery Williams', 'Technical Presentations', 'L300'],
      // Quinn Davis (Senior SE) - Infrastructure and DevOps
      ['Quinn Davis', 'Azure Virtual Machines', 'L400'],
      ['Quinn Davis', 'Azure Virtual Machine Scale Sets', 'L300'],
      ['Quinn Davis', 'Azure DevOps', 'L400'],
      ['Quinn Davis', 'Azure Pipelines', 'L300'],
      ['Quinn Davis', 'Terraform', 'L400'],
      ['Quinn Davis', 'Bicep', 'L300'],
      ['Quinn Davis', 'Azure Migrate', 'L300'],
      ['Quinn Davis', 'Azure Site Recovery', 'L300'],
      ['Quinn Davis', 'PowerShell', 'L300'],
      // Drew Martinez (Senior SE) - Cloud Architecture
      ['Drew Martinez', 'Azure App Service', 'L400'],
      ['Drew Martinez', 'Azure Functions', 'L300'],
      ['Drew Martinez', 'Azure SQL Database', 'L300'],
      ['Drew Martinez', 'Azure Cache for Redis', 'L300'],
      ['Drew Martinez', 'Azure DevOps', 'L300'],
      ['Drew Martinez', 'Microsoft Entra ID', 'L300'],
      ['Drew Martinez', 'Solution Architecture', 'L300'],
      ['Drew Martinez', 'C# / .NET', 'L300'],
      ['Drew Martinez', 'Proof of Concept Delivery', 'L300'],
      // Jamie Lee (Senior SE) - Integration and Messaging
      ['Jamie Lee', 'Azure Service Bus', 'L400'],
      ['Jamie Lee', 'Azure Event Hubs', 'L400'],
      ['Jamie Lee', 'Azure Event Grid', 'L300'],
      ['Jamie Lee', 'Azure Logic Apps', 'L300'],
      ['Jamie Lee', 'Azure API Management', 'L300'],
      ['Jamie Lee', 'Azure Functions', 'L300'],
      ['Jamie Lee', 'Azure Functions Durable', 'L300'],
      ['Jamie Lee', 'Solution Architecture', 'L300'],
      // Sam Patel (Senior SE) - Data Platform
      ['Sam Patel', 'Azure SQL Database', 'L400'],
      ['Sam Patel', 'Azure Synapse Analytics', 'L400'],
      ['Sam Patel', 'Azure Databricks', 'L300'],
      ['Sam Patel', 'Microsoft Fabric', 'L300'],
      ['Sam Patel', 'Power BI', 'L300'],
      ['Sam Patel', 'Azure Data Factory', 'L300'],
      ['Sam Patel', 'Azure Data Lake Storage', 'L300'],
      ['Sam Patel', 'SQL', 'L400'],
      // Taylor Brown (Senior SE) - AI and Customer Success
      ['Taylor Brown', 'Azure OpenAI Service', 'L300'],
      ['Taylor Brown', 'Copilot Studio', 'L300'],
      ['Taylor Brown', 'Prompt Engineering', 'L300'],
      ['Taylor Brown', 'Azure AI Vision', 'L300'],
      ['Taylor Brown', 'Azure AI Speech', 'L300'],
      ['Taylor Brown', 'Technical Presentations', 'L400'],
      ['Taylor Brown', 'Customer Discovery', 'L400'],
      ['Taylor Brown', 'Workshop Facilitation', 'L300'],
      // Jordan Smith (SE) - Cloud Native
      ['Jordan Smith', 'Azure Kubernetes Service (AKS)', 'L300'],
      ['Jordan Smith', 'Azure Container Apps', 'L300'],
      ['Jordan Smith', 'Azure Container Instances', 'L200'],
      ['Jordan Smith', 'GitHub Actions', 'L300'],
      ['Jordan Smith', 'GitHub Copilot', 'L300'],
      ['Jordan Smith', 'Terraform', 'L200'],
      ['Jordan Smith', 'JavaScript / TypeScript', 'L300'],
      ['Jordan Smith', 'Go', 'L200'],
      // Chris Anderson (Senior SE) - AI and Development
      ['Chris Anderson', 'Azure OpenAI Service', 'L400'],
      ['Chris Anderson', 'Azure AI Foundry', 'L300'],
      ['Chris Anderson', 'Semantic Kernel', 'L300'],
      ['Chris Anderson', 'RAG Patterns', 'L400'],
      ['Chris Anderson', 'GitHub Copilot', 'L400'],
      ['Chris Anderson', 'GitHub Actions', 'L300'],
      ['Chris Anderson', 'C# / .NET', 'L300'],
      ['Chris Anderson', 'Python', 'L300'],
      ['Chris Anderson', 'JavaScript / TypeScript', 'L100'],
      ['Chris Anderson', 'React', 'L300'],
      ['Chris Anderson', 'Node.js', 'L300'],
      ['Chris Anderson', 'Solution Architecture', 'L300'],
      ['Chris Anderson', 'Proof of Concept Delivery', 'L300'],
      // Pat Wilson (Senior SE) - Modern Development
      ['Pat Wilson', 'Azure App Service', 'L400'],
      ['Pat Wilson', 'Azure Functions', 'L300'],
      ['Pat Wilson', 'Azure Container Apps', 'L300'],
      ['Pat Wilson', 'Azure OpenAI Service', 'L300'],
      ['Pat Wilson', 'Azure DevOps', 'L300'],
      ['Pat Wilson', 'Azure Monitor', 'L300'],
      ['Pat Wilson', 'C# / .NET', 'L400'],
      ['Pat Wilson', 'JavaScript / TypeScript', 'L300'],
      ['Pat Wilson', 'Solution Architecture', 'L300']
    ];

    for (const [userName, skillName, level] of userSkillsData) {
      await db.query(`
        INSERT INTO user_skills (user_id, skill_id, proficiency_level)
        SELECT u.id, s.id, $3
        FROM users u, skills s
        WHERE u.name = $1 AND s.name = $2
        ON CONFLICT (user_id, skill_id) DO UPDATE SET proficiency_level = $3
      `, [userName, skillName, level]);
    }

    // Get counts
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');
    const skillCount = await db.query('SELECT COUNT(*) as count FROM skills');
    const userSkillCount = await db.query('SELECT COUNT(*) as count FROM user_skills');

    res.json({
      message: 'Database initialized successfully',
      status: 'success',
      counts: {
        users: parseInt(userCount.rows[0].count),
        skills: parseInt(skillCount.rows[0].count),
        userSkills: parseInt(userSkillCount.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check database status
router.get('/status', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as time');
    const userCount = await db.query('SELECT COUNT(*) as count FROM users').catch(() => ({ rows: [{ count: 0 }] }));
    const skillCount = await db.query('SELECT COUNT(*) as count FROM skills').catch(() => ({ rows: [{ count: 0 }] }));
    
    res.json({
      connected: true,
      serverTime: result.rows[0].time,
      counts: {
        users: parseInt(userCount.rows[0].count),
        skills: parseInt(skillCount.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ connected: false, error: error.message });
  }
});

module.exports = router;
