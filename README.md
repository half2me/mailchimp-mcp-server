# Mailchimp MCP Server

An MCP (Model Context Protocol) server that lets Claude interact with the Mailchimp Marketing API. Built for use with Claude Cowork and Claude Code.

## Features

**100+ tools** across 17 categories:

- **Account**: Ping / health check, account info
- **Audiences**: List, get details, create, update, growth history, locations, email client stats
- **Subscribers**: List, search, get, add/update, batch subscribe, archive, unsubscribe, manage tags, activity, notes, merge fields, interest categories, permanent delete
- **Campaigns**: List, get details, create, update, cancel, set/get content, send, schedule, unschedule, replicate, test email, send checklist, search, delete
- **Campaign Feedback**: List, add, update, delete feedback comments
- **Templates**: List, get details, get HTML content, create, update, delete
- **Reports**: List reports, detailed report, click details, open details, email activity, unsubscribes, domain performance, sent-to, A/B test results
- **Automations**: List, get details, list emails, start/pause all, start/pause individual emails, email queue, remove subscriber
- **Customer Journeys**: Trigger journey steps for contacts
- **Segments**: List, get details, create, update, delete, list members
- **Ecommerce**: Stores, products, product details, orders, order details, customers, carts, promo codes
- **Landing Pages**: List, get details, create, update, delete, publish, unpublish
- **Webhooks**: List, create, update, delete
- **File Manager**: List files, get file, upload, delete, list folders, create folder
- **Batch Operations**: Create batch, get status, list batches
- **Verified Domains**: List, add, verify, delete sending domains
- **Activity Feed**: Account-wide activity feed

## Setup

### 1. Get Your Mailchimp API Key

1. Log in to [Mailchimp](https://mailchimp.com)
2. Click your profile icon → **Account & billing**
3. Go to **Extras** → **API keys**
4. Click **Create A Key**
5. Give it a name (e.g., "Claude Cowork") and copy the key

The key looks like: `abc123def456ghi789-us21`

The part after the dash (`us21`) is your data center — the server uses this automatically.

### 2. Build the Server

```bash
cd mailchimp-mcp-server
npm install
npm run build
```

### 3. Configure Claude

#### For Claude Desktop / Cowork

Add this to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mailchimp": {
      "command": "node",
      "args": ["/FULL/PATH/TO/mailchimp-mcp-server/dist/index.js"],
      "env": {
        "MAILCHIMP_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Replace `/FULL/PATH/TO/` with the actual absolute path to this folder, and paste your real API key.

#### For Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "mailchimp": {
      "command": "node",
      "args": ["/FULL/PATH/TO/mailchimp-mcp-server/dist/index.js"],
      "env": {
        "MAILCHIMP_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 4. Restart Claude

After saving the config, restart Claude Desktop (or reload Claude Code) so it picks up the new MCP server.

## Available Tools

### Account (2)
| Tool | Description |
|------|-------------|
| `mailchimp_ping` | Check API connection is working |
| `mailchimp_get_account` | Get account info, plan, and stats |

### Audiences (7)
| Tool | Description |
|------|-------------|
| `mailchimp_list_audiences` | List all audiences with stats |
| `mailchimp_get_audience` | Get audience details |
| `mailchimp_create_audience` | Create a new audience |
| `mailchimp_update_audience` | Update audience settings |
| `mailchimp_get_audience_growth` | Get monthly growth history |
| `mailchimp_get_audience_locations` | Get geographic subscriber breakdown |
| `mailchimp_get_email_client_stats` | Get email client usage stats |

### Subscribers (17)
| Tool | Description |
|------|-------------|
| `mailchimp_list_subscribers` | List subscribers (filter by status) |
| `mailchimp_search_subscribers` | Search by email or name |
| `mailchimp_get_subscriber` | Get subscriber details |
| `mailchimp_add_subscriber` | Add or update subscriber (upsert) |
| `mailchimp_batch_subscribe` | Batch subscribe/unsubscribe members |
| `mailchimp_archive_subscriber` | Archive a subscriber |
| `mailchimp_unsubscribe` | Unsubscribe a member |
| `mailchimp_manage_tags` | Add/remove tags on a subscriber |
| `mailchimp_get_subscriber_activity` | Get subscriber's recent activity |
| `mailchimp_list_subscriber_notes` | List notes on a subscriber |
| `mailchimp_add_subscriber_note` | Add a note to a subscriber |
| `mailchimp_delete_subscriber_permanent` | Permanently delete a subscriber |
| `mailchimp_list_merge_fields` | List custom fields for an audience |
| `mailchimp_create_merge_field` | Create a custom merge field |
| `mailchimp_list_interest_categories` | List interest categories (groups) |
| `mailchimp_list_interests` | List interests in a category |
| `mailchimp_search_tags` | Search tags in an audience |

### Campaigns (15)
| Tool | Description |
|------|-------------|
| `mailchimp_list_campaigns` | List campaigns with filters |
| `mailchimp_get_campaign` | Get campaign details |
| `mailchimp_create_campaign` | Create a draft campaign |
| `mailchimp_update_campaign` | Update campaign settings |
| `mailchimp_set_campaign_content` | Set campaign HTML/text content |
| `mailchimp_get_campaign_content` | Get campaign content |
| `mailchimp_send_campaign` | Send a campaign immediately |
| `mailchimp_schedule_campaign` | Schedule a campaign |
| `mailchimp_unschedule_campaign` | Cancel a scheduled campaign |
| `mailchimp_cancel_campaign` | Cancel a sending campaign |
| `mailchimp_send_test_email` | Send a test email preview |
| `mailchimp_get_send_checklist` | Review send readiness checklist |
| `mailchimp_replicate_campaign` | Duplicate a campaign |
| `mailchimp_search_campaigns` | Search campaigns by title/subject |
| `mailchimp_delete_campaign` | Delete a draft campaign |

### Campaign Feedback (4)
| Tool | Description |
|------|-------------|
| `mailchimp_list_campaign_feedback` | List feedback comments on a campaign |
| `mailchimp_add_campaign_feedback` | Add a feedback comment |
| `mailchimp_update_campaign_feedback` | Update or resolve feedback |
| `mailchimp_delete_campaign_feedback` | Delete a feedback comment |

### Templates (6)
| Tool | Description |
|------|-------------|
| `mailchimp_list_templates` | List email templates |
| `mailchimp_get_template` | Get template metadata |
| `mailchimp_get_template_content` | Get template HTML content |
| `mailchimp_create_template` | Create a template |
| `mailchimp_update_template` | Update template name or HTML |
| `mailchimp_delete_template` | Delete a template |

### Reports (9)
| Tool | Description |
|------|-------------|
| `mailchimp_list_reports` | List campaign reports |
| `mailchimp_get_report` | Get detailed campaign report |
| `mailchimp_get_click_details` | Get URL click details |
| `mailchimp_get_open_details` | Get subscriber open data |
| `mailchimp_get_email_activity` | Get per-subscriber activity log |
| `mailchimp_get_unsubscribes` | List campaign unsubscribes |
| `mailchimp_get_domain_performance` | Email domain performance stats |
| `mailchimp_get_sent_to` | List sent-to recipients |
| `mailchimp_get_ab_test_results` | Get A/B test results |

### Automations (10)
| Tool | Description |
|------|-------------|
| `mailchimp_list_automations` | List automation workflows |
| `mailchimp_get_automation` | Get automation details |
| `mailchimp_list_automation_emails` | List emails in an automation |
| `mailchimp_start_automation` | Start all emails in an automation |
| `mailchimp_pause_automation` | Pause all emails in an automation |
| `mailchimp_start_automation_email` | Start a specific automation email |
| `mailchimp_pause_automation_email` | Pause a specific automation email |
| `mailchimp_list_automation_queue` | List subscribers in email queue |
| `mailchimp_remove_automation_subscriber` | Remove subscriber from automation |

### Customer Journeys (1)
| Tool | Description |
|------|-------------|
| `mailchimp_trigger_journey_step` | Trigger a journey step for a contact |

### Segments (6)
| Tool | Description |
|------|-------------|
| `mailchimp_list_segments` | List segments for an audience |
| `mailchimp_get_segment` | Get segment details and conditions |
| `mailchimp_create_segment` | Create a segment (static or saved) |
| `mailchimp_update_segment` | Update segment name or members |
| `mailchimp_delete_segment` | Delete a segment |
| `mailchimp_list_segment_members` | List members in a segment |

### Ecommerce (9)
| Tool | Description |
|------|-------------|
| `mailchimp_list_ecommerce_stores` | List connected stores |
| `mailchimp_list_store_products` | List products in a store |
| `mailchimp_get_store_product` | Get product details with variants |
| `mailchimp_list_store_orders` | List orders (filter by campaign) |
| `mailchimp_get_store_order` | Get order details with line items |
| `mailchimp_list_store_customers` | List store customers |
| `mailchimp_get_ecommerce_customer` | Get customer details |
| `mailchimp_list_store_carts` | List abandoned carts |
| `mailchimp_list_store_promo_codes` | List promo codes for a rule |

### Landing Pages (7)
| Tool | Description |
|------|-------------|
| `mailchimp_list_landing_pages` | List all landing pages |
| `mailchimp_get_landing_page` | Get landing page details |
| `mailchimp_create_landing_page` | Create a landing page |
| `mailchimp_update_landing_page` | Update a landing page |
| `mailchimp_delete_landing_page` | Delete a landing page |
| `mailchimp_publish_landing_page` | Publish a landing page |
| `mailchimp_unpublish_landing_page` | Unpublish a landing page |

### Webhooks (4)
| Tool | Description |
|------|-------------|
| `mailchimp_list_webhooks` | List webhooks for an audience |
| `mailchimp_create_webhook` | Create a webhook |
| `mailchimp_update_webhook` | Update a webhook |
| `mailchimp_delete_webhook` | Delete a webhook |

### File Manager (6)
| Tool | Description |
|------|-------------|
| `mailchimp_list_files` | List files in file manager |
| `mailchimp_get_file` | Get file details |
| `mailchimp_upload_file` | Upload a file (base64) |
| `mailchimp_delete_file` | Delete a file |
| `mailchimp_list_file_folders` | List file manager folders |
| `mailchimp_create_file_folder` | Create a folder |

### Batch Operations (3)
| Tool | Description |
|------|-------------|
| `mailchimp_create_batch` | Create a batch operation (up to 500 ops) |
| `mailchimp_get_batch_status` | Get batch operation status |
| `mailchimp_list_batches` | List batch operations |

### Verified Domains (4)
| Tool | Description |
|------|-------------|
| `mailchimp_list_verified_domains` | List verified sending domains |
| `mailchimp_add_verified_domain` | Add a domain to verify |
| `mailchimp_verify_domain` | Submit verification code |
| `mailchimp_delete_verified_domain` | Remove a verified domain |

### Activity Feed (1)
| Tool | Description |
|------|-------------|
| `mailchimp_get_activity_feed` | Get account-wide activity feed |
