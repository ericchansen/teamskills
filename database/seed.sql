-- Hierarchical seed data generated from Inventory.csv
-- Categories and skills are real Azure service names (public).
-- Users are FAKE demo data for development/testing only.
-- Real user data is imported at runtime via /api/admin/sync-skills.

-- ============================================
-- SCHEMA
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    entra_oid VARCHAR(36),
    role VARCHAR(100),
    team VARCHAR(100),
    qualifier VARCHAR(100),
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL;

CREATE TABLE IF NOT EXISTS skill_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INTEGER REFERENCES skill_categories(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parent_id, name)
);

CREATE TABLE IF NOT EXISTS skills (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id INTEGER REFERENCES skill_categories(id) ON DELETE SET NULL,
    description TEXT,
    target_level VARCHAR(10) DEFAULT 'L200',
    is_core BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_skill_categories_parent ON skill_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_parent ON skill_relationships(parent_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_child ON skill_relationships(child_skill_id);

CREATE TABLE IF NOT EXISTS skill_proposals (
    id SERIAL PRIMARY KEY,
    proposed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    category_id INTEGER REFERENCES skill_categories(id) ON DELETE SET NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skill_proposals_status ON skill_proposals(status);

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

CREATE TABLE IF NOT EXISTS user_skills_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level VARCHAR(10) NOT NULL CHECK (proficiency_level IN ('L100', 'L200', 'L300', 'L400')),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_skills_history_user ON user_skills_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_history_skill ON user_skills_history(skill_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_history_changed ON user_skills_history(changed_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    performed_by TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION record_skill_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (OLD.proficiency_level IS DISTINCT FROM NEW.proficiency_level) THEN
        INSERT INTO user_skills_history (user_id, skill_id, proficiency_level)
        VALUES (NEW.user_id, NEW.skill_id, NEW.proficiency_level);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS track_skill_changes ON user_skills;
CREATE TRIGGER track_skill_changes
    AFTER INSERT OR UPDATE ON user_skills
    FOR EACH ROW
    EXECUTE FUNCTION record_skill_history();


-- ============================================
-- SKILL CATEGORIES (Role > Domain > Subdomain)
-- ============================================
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (1, 'Apps & AI', NULL, 1, 10);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (33, 'Data', NULL, 1, 330);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (40, 'Infra', NULL, 1, 400);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (2, 'Agentic AI', 1, 2, 10);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (6, 'AI & Machine Learning', 1, 2, 20);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (11, 'Application Development', 1, 2, 30);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (16, 'Containers', 1, 2, 40);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (18, 'DevOps', 1, 2, 50);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (21, 'Messaging & Event Streaming', 1, 2, 60);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (22, 'Monitoring & Observability', 1, 2, 70);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (23, 'Networking', 1, 2, 80);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (25, 'Programming Languages', 1, 2, 90);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (29, 'Security & Identity', 1, 2, 100);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (34, 'Databases', 33, 2, 110);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (38, 'Analytics', 33, 2, 120);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (41, 'Compute', 40, 2, 130);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (46, 'Storage', 40, 2, 140);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (50, 'Networking', 40, 2, 150);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (3, 'Development Tools', 2, 3, 10);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (4, 'Framework', 2, 3, 20);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (5, 'Solution', 2, 3, 30);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (7, 'Fundamentals: Computer Vision', 6, 3, 40);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (8, 'Fundamentals: Large Language Models (LLMs)', 6, 3, 50);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (9, 'Fundamentals: Security', 6, 3, 60);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (10, 'Solution', 6, 3, 70);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (12, 'Fundamentals', 11, 3, 80);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (13, 'Solution', 11, 3, 90);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (14, 'Best Practices', 11, 3, 100);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (15, 'Framework', 11, 3, 110);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (17, 'Solution', 16, 3, 120);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (19, 'CI/CD', 18, 3, 130);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (20, 'Platform', 18, 3, 140);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (24, 'Solution', 23, 3, 150);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (26, 'Declarative', 25, 3, 160);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (27, 'Programming', 25, 3, 170);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (28, 'Scripting', 25, 3, 180);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (30, 'Governance', 29, 3, 190);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (31, 'Identity', 29, 3, 200);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (32, 'Security', 29, 3, 210);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (35, 'MySQL', 34, 3, 220);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (36, 'SQL', 34, 3, 230);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (37, 'Postgre', 34, 3, 240);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (39, 'Fabric', 38, 3, 250);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (42, 'Virtual Machine', 41, 3, 260);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (43, 'Containers', 41, 3, 270);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (44, 'Serverless Compute', 41, 3, 280);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (45, 'Specialized Compute', 41, 3, 290);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (47, 'Blob Storage', 46, 3, 300);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (48, 'File and Disk Storage', 46, 3, 310);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (49, 'Data Migration', 46, 3, 320);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (51, 'Core Networking', 50, 3, 330);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (52, 'Hybrid Networking', 50, 3, 340);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (53, 'Load Balancing and Delivery', 50, 3, 350);
INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES (54, 'Network Security', 50, 3, 360);
SELECT setval('skill_categories_id_seq', 54);

-- ============================================
-- SKILLS (145 skills)
-- ============================================
INSERT INTO skills (id, name, category_id) VALUES (1, 'GitHub Copilot', 3);
INSERT INTO skills (id, name, category_id) VALUES (2, 'GitHub Copilot CLI', 3);
INSERT INTO skills (id, name, category_id) VALUES (3, 'Microsoft Agent Framework', 4);
INSERT INTO skills (id, name, category_id) VALUES (4, 'Model Context Protocol (MCP)', 4);
INSERT INTO skills (id, name, category_id) VALUES (5, 'Azure SRE Agent', 5);
INSERT INTO skills (id, name, category_id) VALUES (6, 'Microsoft 365 Copilot', 5);
INSERT INTO skills (id, name, category_id) VALUES (7, 'Microsoft Copilot Studio', 5);
INSERT INTO skills (id, name, category_id) VALUES (8, 'Microsoft Foundry Agent Service', 5);
INSERT INTO skills (id, name, category_id) VALUES (9, 'Image Classification', 7);
INSERT INTO skills (id, name, category_id) VALUES (10, 'Image Segmentation', 7);
INSERT INTO skills (id, name, category_id) VALUES (11, 'Object Detection', 7);
INSERT INTO skills (id, name, category_id) VALUES (12, 'Prompt Engineering', 8);
INSERT INTO skills (id, name, category_id) VALUES (13, 'Retrieval-Augmented Generation (RAG)', 8);
INSERT INTO skills (id, name, category_id) VALUES (14, 'Supervised Fine-Tuning', 8);
INSERT INTO skills (id, name, category_id) VALUES (15, 'Responsible AI', 9);
INSERT INTO skills (id, name, category_id) VALUES (16, 'Azure AI Anomaly Detector', 10);
INSERT INTO skills (id, name, category_id) VALUES (17, 'Azure AI Bot Service', 10);
INSERT INTO skills (id, name, category_id) VALUES (18, 'Azure AI Content Safety', 10);
INSERT INTO skills (id, name, category_id) VALUES (19, 'Azure AI Custom Vision', 10);
INSERT INTO skills (id, name, category_id) VALUES (20, 'Azure AI Face', 10);
INSERT INTO skills (id, name, category_id) VALUES (21, 'Azure AI Search', 10);
INSERT INTO skills (id, name, category_id) VALUES (22, 'Azure AI Services (OpenAI)', 10);
INSERT INTO skills (id, name, category_id) VALUES (23, 'Azure AI Video Indexer', 10);
INSERT INTO skills (id, name, category_id) VALUES (24, 'Azure Document Intelligence', 10);
INSERT INTO skills (id, name, category_id) VALUES (25, 'Azure Language', 10);
INSERT INTO skills (id, name, category_id) VALUES (26, 'Azure Machine Learning', 10);
INSERT INTO skills (id, name, category_id) VALUES (27, 'Azure Speech', 10);
INSERT INTO skills (id, name, category_id) VALUES (28, 'Azure Vision', 10);
INSERT INTO skills (id, name, category_id) VALUES (29, 'Microsoft Foundry', 10);
INSERT INTO skills (id, name, category_id) VALUES (30, 'Infrastructure as Code (IaC)', 12);
INSERT INTO skills (id, name, category_id) VALUES (31, 'Redis', 13);
INSERT INTO skills (id, name, category_id) VALUES (32, 'Unit Testing', 14);
INSERT INTO skills (id, name, category_id) VALUES (33, 'Azure Functions', 13);
INSERT INTO skills (id, name, category_id) VALUES (34, 'Playwright', 15);
INSERT INTO skills (id, name, category_id) VALUES (35, 'Git', 15);
INSERT INTO skills (id, name, category_id) VALUES (36, 'Azure App Configuration', 17);
INSERT INTO skills (id, name, category_id) VALUES (37, 'Azure Container Apps', 17);
INSERT INTO skills (id, name, category_id) VALUES (38, 'Azure Container Instance', 17);
INSERT INTO skills (id, name, category_id) VALUES (39, 'Azure Container Registry', 17);
INSERT INTO skills (id, name, category_id) VALUES (40, 'Azure Kubernetes Service (AKS)', 17);
INSERT INTO skills (id, name, category_id) VALUES (41, 'Azure Pipelines (Azure DevOps Pipelines)', 19);
INSERT INTO skills (id, name, category_id) VALUES (42, 'GitHub Actions', 19);
INSERT INTO skills (id, name, category_id) VALUES (43, 'Azure DevOps', 20);
INSERT INTO skills (id, name, category_id) VALUES (44, 'GitHub', 20);
INSERT INTO skills (id, name, category_id) VALUES (45, 'Apache Kafka', 21);
INSERT INTO skills (id, name, category_id) VALUES (46, 'Azure Event Grid', 21);
INSERT INTO skills (id, name, category_id) VALUES (47, 'Azure Event Hubs', 21);
INSERT INTO skills (id, name, category_id) VALUES (48, 'Azure Service Bus', 21);
INSERT INTO skills (id, name, category_id) VALUES (49, 'Azure Application Insights', 22);
INSERT INTO skills (id, name, category_id) VALUES (50, 'Azure Monitor', 22);
INSERT INTO skills (id, name, category_id) VALUES (51, 'Elasticsearch', 22);
INSERT INTO skills (id, name, category_id) VALUES (52, 'Azure API Management', 24);
INSERT INTO skills (id, name, category_id) VALUES (53, 'Azure Application Gateway', 24);
INSERT INTO skills (id, name, category_id) VALUES (54, 'Azure Bastion', 24);
INSERT INTO skills (id, name, category_id) VALUES (55, 'Azure Front Door', 24);
INSERT INTO skills (id, name, category_id) VALUES (56, 'Azure Private Endpoint', 24);
INSERT INTO skills (id, name, category_id) VALUES (57, 'Azure Virtual Network (VNet)', 24);
INSERT INTO skills (id, name, category_id) VALUES (58, 'Bicep', 26);
INSERT INTO skills (id, name, category_id) VALUES (59, 'Terraform', 26);
INSERT INTO skills (id, name, category_id) VALUES (60, 'C# / .NET', 27);
INSERT INTO skills (id, name, category_id) VALUES (61, 'Go', 27);
INSERT INTO skills (id, name, category_id) VALUES (62, 'Java', 27);
INSERT INTO skills (id, name, category_id) VALUES (63, 'JavaScript / TypeScript', 27);
INSERT INTO skills (id, name, category_id) VALUES (64, 'Python', 27);
INSERT INTO skills (id, name, category_id) VALUES (65, 'Bash / Shell', 28);
INSERT INTO skills (id, name, category_id) VALUES (66, 'PowerShell', 28);
INSERT INTO skills (id, name, category_id) VALUES (67, 'Azure Policy', 30);
INSERT INTO skills (id, name, category_id) VALUES (68, 'Microsoft Entra ID', 31);
INSERT INTO skills (id, name, category_id) VALUES (69, 'Azure Key Vault', 32);
INSERT INTO skills (id, name, category_id) VALUES (70, 'Microsoft Sentinel', 32);
INSERT INTO skills (id, name, category_id) VALUES (71, 'Azure MySQL', 35);
INSERT INTO skills (id, name, category_id) VALUES (72, 'SQL MI', 36);
INSERT INTO skills (id, name, category_id) VALUES (73, 'SQL DB', 36);
INSERT INTO skills (id, name, category_id) VALUES (74, 'SQL on VMs', 36);
INSERT INTO skills (id, name, category_id) VALUES (75, 'SQL DB Hyperscale', 36);
INSERT INTO skills (id, name, category_id) VALUES (76, 'DB for PostgreSQL', 37);
INSERT INTO skills (id, name, category_id) VALUES (77, 'Horizon DB', 37);
INSERT INTO skills (id, name, category_id) VALUES (78, 'CosmosDB', 34);
INSERT INTO skills (id, name, category_id) VALUES (79, 'Oracle Database @Azure', 34);
INSERT INTO skills (id, name, category_id) VALUES (80, 'Document DB', 34);
INSERT INTO skills (id, name, category_id) VALUES (81, 'Azure Arc', 34);
INSERT INTO skills (id, name, category_id) VALUES (82, 'Cache for Redis', 34);
INSERT INTO skills (id, name, category_id) VALUES (83, 'Manged Redis', 34);
INSERT INTO skills (id, name, category_id) VALUES (84, 'Analysis Services', 38);
INSERT INTO skills (id, name, category_id) VALUES (85, 'Power BI Embedded', 38);
INSERT INTO skills (id, name, category_id) VALUES (86, 'Power BI', 39);
INSERT INTO skills (id, name, category_id) VALUES (87, 'Event Hubs', 38);
INSERT INTO skills (id, name, category_id) VALUES (88, 'Log Analytics Workspace', 38);
INSERT INTO skills (id, name, category_id) VALUES (89, 'Synapse Analytics Serverless', 38);
INSERT INTO skills (id, name, category_id) VALUES (90, 'Synapse Analytics Dedicated Pools', 38);
INSERT INTO skills (id, name, category_id) VALUES (91, 'Azure Data Factory', 38);
INSERT INTO skills (id, name, category_id) VALUES (92, 'OneLake', 39);
INSERT INTO skills (id, name, category_id) VALUES (93, 'Cosmos DB on Fabric', 39);
INSERT INTO skills (id, name, category_id) VALUES (94, 'Data Engineering and Data Science', 39);
INSERT INTO skills (id, name, category_id) VALUES (95, 'Data Factory', 39);
INSERT INTO skills (id, name, category_id) VALUES (96, 'Data Warehouse', 39);
INSERT INTO skills (id, name, category_id) VALUES (97, 'Fabric Admin, governance, and security', 39);
INSERT INTO skills (id, name, category_id) VALUES (98, 'Fabric Purview integration', 39);
INSERT INTO skills (id, name, category_id) VALUES (99, 'Real Time Intelligence', 39);
INSERT INTO skills (id, name, category_id) VALUES (100, 'Fabric IQ', 39);
INSERT INTO skills (id, name, category_id) VALUES (101, 'MySQL DB on Fabric', 39);
INSERT INTO skills (id, name, category_id) VALUES (102, 'PostgreSQL on Fabric', 39);
INSERT INTO skills (id, name, category_id) VALUES (103, 'SQL DB on Fabric', 39);
INSERT INTO skills (id, name, category_id) VALUES (104, 'Fabric Capacity Management', 39);
INSERT INTO skills (id, name, category_id) VALUES (105, 'VM Sizes', 42);
INSERT INTO skills (id, name, category_id) VALUES (106, 'Availability Sets/Zones', 42);
INSERT INTO skills (id, name, category_id) VALUES (107, 'ScaleSets', 42);
INSERT INTO skills (id, name, category_id) VALUES (108, 'Spot VMs', 42);
INSERT INTO skills (id, name, category_id) VALUES (109, 'Dedicatd Hosts', 42);
INSERT INTO skills (id, name, category_id) VALUES (110, 'AKS', 43);
INSERT INTO skills (id, name, category_id) VALUES (111, 'Azure Container Instances', 43);
INSERT INTO skills (id, name, category_id) VALUES (112, 'Container Registry', 43);
INSERT INTO skills (id, name, category_id) VALUES (113, 'App Service', 44);
INSERT INTO skills (id, name, category_id) VALUES (114, 'Static WebApps', 44);
INSERT INTO skills (id, name, category_id) VALUES (115, 'Azure Batch', 45);
INSERT INTO skills (id, name, category_id) VALUES (116, 'Azure VMWare Solution', 45);
INSERT INTO skills (id, name, category_id) VALUES (117, 'HPC', 45);
INSERT INTO skills (id, name, category_id) VALUES (118, 'Access Tiers', 47);
INSERT INTO skills (id, name, category_id) VALUES (119, 'Lifecycle Management', 47);
INSERT INTO skills (id, name, category_id) VALUES (120, 'Object Replication', 47);
INSERT INTO skills (id, name, category_id) VALUES (121, 'Immutable Storage', 47);
INSERT INTO skills (id, name, category_id) VALUES (122, 'Azure Files', 48);
INSERT INTO skills (id, name, category_id) VALUES (123, 'Managed Disks', 48);
INSERT INTO skills (id, name, category_id) VALUES (124, 'File Sync', 48);
INSERT INTO skills (id, name, category_id) VALUES (125, 'Elastic SAN', 48);
INSERT INTO skills (id, name, category_id) VALUES (126, 'AzCopy', 49);
INSERT INTO skills (id, name, category_id) VALUES (127, 'Storage Explorer', 49);
INSERT INTO skills (id, name, category_id) VALUES (128, 'Data Box', 49);
INSERT INTO skills (id, name, category_id) VALUES (129, 'Storage Mover', 49);
INSERT INTO skills (id, name, category_id) VALUES (130, 'Virtual Networks', 51);
INSERT INTO skills (id, name, category_id) VALUES (131, 'IP Addressing', 51);
INSERT INTO skills (id, name, category_id) VALUES (132, 'vNET Peering', 51);
INSERT INTO skills (id, name, category_id) VALUES (133, 'NSGs/ASG', 51);
INSERT INTO skills (id, name, category_id) VALUES (134, 'VPN Gateways', 52);
INSERT INTO skills (id, name, category_id) VALUES (135, 'Express Route', 52);
INSERT INTO skills (id, name, category_id) VALUES (136, 'Virtual WAN', 52);
INSERT INTO skills (id, name, category_id) VALUES (137, 'Bastion', 52);
INSERT INTO skills (id, name, category_id) VALUES (138, 'Load Balancers', 53);
INSERT INTO skills (id, name, category_id) VALUES (139, 'App Gateway', 53);
INSERT INTO skills (id, name, category_id) VALUES (140, 'Front Door', 53);
INSERT INTO skills (id, name, category_id) VALUES (141, 'Traffic Manager', 53);
INSERT INTO skills (id, name, category_id) VALUES (142, 'Azure Firewall', 54);
INSERT INTO skills (id, name, category_id) VALUES (143, 'DDoS Protection', 54);
INSERT INTO skills (id, name, category_id) VALUES (144, 'Private Link', 54);
INSERT INTO skills (id, name, category_id) VALUES (145, 'Network Watcher', 54);
SELECT setval('skills_id_seq', 145);

-- ============================================
-- DEMO USERS (fictional — for development only)
-- ============================================
INSERT INTO users (id, name, email, role, team, qualifier) VALUES (1, 'Alex Chen', 'alex.chen@example.com', 'Apps & AI', 'Apps & AI', 'Apps & AI');
INSERT INTO users (id, name, email, role, team, qualifier) VALUES (2, 'Sam Rivera', 'sam.rivera@example.com', 'Data', 'Data', 'Data');
INSERT INTO users (id, name, email, role, team, qualifier) VALUES (3, 'Morgan Taylor', 'morgan.taylor@example.com', 'Infra', 'Infra', 'Infra');
INSERT INTO users (id, name, email, role, team, qualifier) VALUES (4, 'Jamie Park', 'jamie.park@example.com', 'Apps & AI', 'Apps & AI', 'Apps & AI');
INSERT INTO users (id, name, email, role, team, qualifier) VALUES (5, 'Casey Brooks', 'casey.brooks@example.com', 'Data', 'Data', 'Data');
INSERT INTO users (id, name, email, role, team, qualifier) VALUES (6, 'Riley Quinn', 'riley.quinn@example.com', 'Infra', 'Infra', 'Infra');
SELECT setval('users_id_seq', 6);

-- ============================================
-- DEMO USER SKILLS (fictional proficiency data)
-- ============================================
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 1, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 2, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 3, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 4, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 5, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 6, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 7, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 8, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 9, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 10, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 11, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 12, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 13, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 14, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 15, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 16, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 17, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 18, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 19, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 20, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 21, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 22, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 23, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 24, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 25, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 26, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 27, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 28, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 29, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 30, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 31, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 32, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 33, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 34, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 35, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 36, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 37, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 38, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 39, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 40, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 41, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 42, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 43, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 44, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 45, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 46, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 47, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 48, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 49, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 50, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 51, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 52, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 53, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 54, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 55, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 56, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 57, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 58, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 59, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 60, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 61, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 62, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 63, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 64, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 65, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 66, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 67, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 68, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 69, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 70, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 72, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 73, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 74, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 75, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 76, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 77, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 78, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 81, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 83, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 84, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 85, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 87, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 88, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 92, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 93, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 94, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 96, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 97, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 98, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 99, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 100, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 102, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 103, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 104, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 106, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 108, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 109, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 110, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 111, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 113, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 115, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 116, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 118, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 119, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 121, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 122, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 123, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 124, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 126, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 128, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 129, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 130, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 131, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 133, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 134, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 136, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 138, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 139, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 141, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 142, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 144, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (1, 145, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 2, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 3, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 5, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 6, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 7, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 8, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 9, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 12, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 13, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 17, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 19, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 20, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 23, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 26, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 27, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 28, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 29, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 30, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 33, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 34, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 35, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 36, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 37, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 38, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 40, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 41, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 42, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 45, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 46, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 49, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 50, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 51, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 52, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 54, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 55, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 56, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 57, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 58, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 60, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 62, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 64, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 65, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 67, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 68, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 69, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 70, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 71, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 72, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 73, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 74, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 75, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 76, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 77, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 78, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 79, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 80, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 81, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 82, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 83, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 84, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 85, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 86, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 87, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 88, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 89, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 90, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 91, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 92, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 93, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 94, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 95, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 96, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 97, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 98, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 99, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 100, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 101, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 102, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 103, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 104, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 106, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 107, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 109, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 110, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 111, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 115, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 116, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 117, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 118, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 120, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 121, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 122, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 123, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 124, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 126, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 128, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 129, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 133, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 135, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 136, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 138, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 140, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 141, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 142, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (2, 144, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 2, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 3, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 5, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 6, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 7, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 10, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 11, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 12, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 13, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 14, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 17, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 18, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 19, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 20, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 21, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 25, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 26, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 27, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 28, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 30, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 31, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 32, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 33, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 34, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 36, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 37, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 38, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 39, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 40, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 41, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 43, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 45, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 46, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 48, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 49, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 50, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 51, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 55, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 56, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 57, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 59, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 60, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 61, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 62, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 63, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 65, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 67, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 70, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 71, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 72, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 73, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 74, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 75, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 76, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 78, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 80, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 81, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 82, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 83, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 84, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 85, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 87, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 88, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 89, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 90, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 91, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 92, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 93, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 94, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 95, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 98, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 99, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 100, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 101, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 102, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 103, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 104, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 105, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 106, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 107, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 108, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 109, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 110, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 111, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 112, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 113, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 114, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 115, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 116, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 117, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 118, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 119, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 120, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 121, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 122, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 123, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 124, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 125, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 126, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 127, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 128, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 129, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 130, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 131, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 132, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 133, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 134, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 135, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 136, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 137, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 138, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 139, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 140, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 141, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 142, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 143, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 144, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (3, 145, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 1, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 2, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 3, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 4, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 5, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 6, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 7, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 8, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 9, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 10, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 11, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 12, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 13, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 14, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 15, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 16, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 17, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 18, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 19, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 20, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 21, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 22, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 23, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 24, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 25, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 26, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 27, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 28, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 29, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 30, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 31, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 32, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 33, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 34, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 35, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 36, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 37, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 38, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 39, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 40, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 41, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 42, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 43, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 44, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 45, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 46, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 47, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 48, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 49, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 50, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 51, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 52, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 53, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 54, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 55, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 56, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 57, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 58, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 59, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 60, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 61, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 62, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 63, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 64, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 65, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 66, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 67, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 68, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 69, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 70, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 71, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 73, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 75, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 77, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 78, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 79, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 80, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 81, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 85, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 86, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 87, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 88, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 89, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 90, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 91, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 92, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 97, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 98, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 100, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 101, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 103, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 104, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 106, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 107, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 110, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 111, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 112, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 113, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 114, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 116, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 117, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 119, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 120, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 121, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 123, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 124, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 125, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 126, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 127, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 128, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 129, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 130, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 131, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 133, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 134, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 135, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 136, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 137, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 138, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 139, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 141, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 142, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 143, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 144, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (4, 145, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 2, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 3, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 5, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 7, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 8, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 9, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 11, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 14, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 15, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 16, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 17, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 20, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 22, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 23, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 24, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 25, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 26, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 27, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 28, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 31, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 32, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 33, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 34, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 35, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 36, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 37, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 38, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 39, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 45, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 46, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 49, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 50, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 51, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 52, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 59, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 61, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 62, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 63, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 65, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 66, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 67, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 68, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 69, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 70, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 71, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 72, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 73, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 74, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 75, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 76, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 77, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 78, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 79, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 80, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 81, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 82, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 83, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 84, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 85, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 86, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 87, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 88, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 89, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 90, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 91, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 92, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 93, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 94, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 95, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 96, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 97, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 98, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 99, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 100, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 101, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 102, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 103, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 104, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 106, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 107, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 110, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 111, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 112, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 113, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 114, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 115, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 116, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 117, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 118, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 119, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 120, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 121, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 122, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 123, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 126, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 127, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 128, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 131, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 132, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 133, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 134, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 135, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 138, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 139, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 142, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 143, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 144, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (5, 145, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 1, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 2, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 5, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 6, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 7, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 8, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 10, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 11, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 12, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 14, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 15, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 16, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 17, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 18, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 19, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 21, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 22, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 23, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 24, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 25, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 26, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 27, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 28, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 29, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 30, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 31, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 32, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 33, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 35, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 36, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 37, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 38, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 40, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 41, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 42, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 43, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 45, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 46, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 49, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 50, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 52, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 53, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 54, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 56, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 57, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 58, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 59, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 61, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 62, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 64, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 65, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 66, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 67, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 68, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 69, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 71, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 72, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 73, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 74, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 75, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 78, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 79, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 80, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 82, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 83, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 84, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 85, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 86, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 87, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 89, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 90, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 92, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 94, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 95, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 96, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 97, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 98, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 99, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 100, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 101, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 103, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 104, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 105, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 106, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 107, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 108, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 109, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 110, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 111, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 112, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 113, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 114, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 115, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 116, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 117, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 118, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 119, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 120, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 121, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 122, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 123, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 124, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 125, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 126, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 127, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 128, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 129, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 130, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 131, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 132, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 133, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 134, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 135, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 136, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 137, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 138, 'L200');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 139, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 140, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 141, 'L100');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 142, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 143, 'L300');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 144, 'L400');
INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES (6, 145, 'L200');
-- Total: 701 demo user-skill entries
