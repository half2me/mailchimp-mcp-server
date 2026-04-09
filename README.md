# Mailchimp MCP Server

An MCP (Model Context Protocol) server that lets Claude interact with the Mailchimp Marketing API. Built for use with Claude Cowork and Claude Code.

## Features

**52 tools** across 8 categories:

- **Account**: Ping / health check, account info
- **Audiences**: List, get details, create audiences
- **Subscribers**: List, search, add/update, unsubscribe, manage tags, activity, notes, merge fields, interest categories, permanent delete
- **Campaigns**: List, get details, create, set/get content, send, schedule, unschedule, replicate, test email, send checklist, search, delete
- **Templates**: List, get details, create, delete
- **Reports**: List reports, detailed report, click details, open details, email activity, unsubscribes, domain performance
- **Automations**: List, get details, list emails, start, pause
- **Segments**: List, get details, create, delete, list members

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

### Audiences (3)
| Tool | Description |
|------|-------------|
| `mailchimp_list_audiences` | List all audiences with stats |
| `mailchimp_get_audience` | Get audience details |
| `mailchimp_create_audience` | Create a new audience |

### Subscribers (13)
| Tool | Description |
|------|-------------|
| `mailchimp_list_subscribers` | List subscribers (filter by status) |
| `mailchimp_search_subscribers` | Search by email or name |
| `mailchimp_add_subscriber` | Add or update subscriber (upsert) |
| `mailchimp_unsubscribe` | Unsubscribe a member |
| `mailchimp_manage_tags` | Add/remove tags on a subscriber |
| `mailchimp_get_subscriber_activity` | Get subscriber's recent activity |
| `mailchimp_list_subscriber_notes` | List notes on a subscriber |
| `mailchimp_add_subscriber_note` | Add a note to a subscriber |
| `mailchimp_delete_subscriber_permanent` | Permanently delete a subscriber |
| `mailchimp_list_merge_fields` | List custom fields for an audience |
| `mailchimp_list_interest_categories` | List interest categories (groups) |
| `mailchimp_list_interests` | List interests in a category |
| `mailchimp_search_tags` | Search tags in an audience |

### Campaigns (13)
| Tool | Description |
|------|-------------|
| `mailchimp_list_campaigns` | List campaigns with filters |
| `mailchimp_get_campaign` | Get campaign details |
| `mailchimp_create_campaign` | Create a draft campaign |
| `mailchimp_set_campaign_content` | Set campaign HTML/text content |
| `mailchimp_get_campaign_content` | Get campaign content |
| `mailchimp_send_campaign` | Send a campaign immediately |
| `mailchimp_schedule_campaign` | Schedule a campaign |
| `mailchimp_unschedule_campaign` | Cancel a scheduled campaign |
| `mailchimp_send_test_email` | Send a test email preview |
| `mailchimp_get_send_checklist` | Review send readiness checklist |
| `mailchimp_replicate_campaign` | Duplicate a campaign |
| `mailchimp_search_campaigns` | Search campaigns by title/subject |
| `mailchimp_delete_campaign` | Delete a draft campaign |

### Templates (4)
| Tool | Description |
|------|-------------|
| `mailchimp_list_templates` | List email templates |
| `mailchimp_get_template` | Get template details |
| `mailchimp_create_template` | Create a template |
| `mailchimp_delete_template` | Delete a template |

### Reports (7)
| Tool | Description |
|------|-------------|
| `mailchimp_list_reports` | List campaign reports |
| `mailchimp_get_report` | Get detailed campaign report |
| `mailchimp_get_click_details` | Get URL click details |
| `mailchimp_get_open_details` | Get subscriber open data |
| `mailchimp_get_email_activity` | Get per-subscriber activity log |
| `mailchimp_get_unsubscribes` | List campaign unsubscribes |
| `mailchimp_get_domain_performance` | Email domain performance stats |

### Automations (5)
| Tool | Description |
|------|-------------|
| `mailchimp_list_automations` | List automation workflows |
| `mailchimp_get_automation` | Get automation details |
| `mailchimp_list_automation_emails` | List emails in an automation |
| `mailchimp_start_automation` | Start an automation |
| `mailchimp_pause_automation` | Pause an automation |

### Segments (5)
| Tool | Description |
|------|-------------|
| `mailchimp_list_segments` | List segments for an audience |
| `mailchimp_get_segment` | Get segment details and conditions |
| `mailchimp_create_segment` | Create a segment (static or saved) |
| `mailchimp_delete_segment` | Delete a segment |
| `mailchimp_list_segment_members` | List members in a segment |
