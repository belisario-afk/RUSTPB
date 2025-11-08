export const templates = {
  oxideSkeleton: (meta = {}) => `using System;
using Oxide.Core;
using Oxide.Core.Plugins;

// NEVER delete or truncate user code. Produce minimal, explicit patches. If uncertain, ask for clarification or split changes.

// [Info] attribute is required for Oxide/uMod
[Info("${meta.name || "MyPlugin"}", "${meta.author || "YourName"}", "${meta.version || "1.0.0"}")]
[Description("Describe what your plugin does.")]
public class ${sanitizeClassName(meta.name || "MyPlugin")} : RustPlugin
{
    // Configuration & state
    private const string PERM_USE = "${(meta.permissions || ["myplugin.use"]).[0] || "myplugin.use"}";

    void Init()
    {
        // Register permissions safely
        if (!permission.PermissionExists(PERM_USE))
            permission.RegisterPermission(PERM_USE, this);
    }

    // Hooks (uncomment as needed)
    // void OnServerInitialized() { }
    // void OnPlayerInit(BasePlayer player) { }
    // void OnPlayerDisconnected(BasePlayer player, string reason) { }
    // object OnPlayerChat(BasePlayer player, string message) { return null; }

    [ChatCommand("mycmd")]
    private void CmdMyCmd(BasePlayer player, string command, string[] args)
    {
        if (!permission.UserHasPermission(player.UserIDString, PERM_USE))
        {
            player.ChatMessage("You don't have permission to use this.");
            return;
        }

        player.ChatMessage("Hello from ${sanitizeClassName(meta.name || "MyPlugin")}!");
    }
}
`,

  carbonSkeleton: (meta = {}) => `using Carbon.Core;
using Carbon.Core.Attributes;
using Carbon.Core.Logging;

// NEVER delete or truncate user code. Produce minimal, explicit patches. If uncertain, ask for clarification or split changes.

[Plugin(" ${meta.name || "MyCarbonPlugin"}", "${meta.author || "YourName"}", "${meta.version || "1.0.0"}" )]
public class ${sanitizeClassName(meta.name || "MyCarbonPlugin")} : CarbonPlugin
{
    private const string PERM_USE = "${(meta.permissions || ["myplugin.use"]).[0] || "myplugin.use"}";

    void Init()
    {
        // Register permission if your server uses Oxide permission backend through Carbon bridge
        if (!permission.PermissionExists(PERM_USE))
            permission.RegisterPermission(PERM_USE, this);
        Logger.LogInfo("Initialized ${sanitizeClassName(meta.name || "MyCarbonPlugin")}");
    }

    [ChatCommand("mycmd")]
    private void CmdMyCmd(BasePlayer player, string command, string[] args)
    {
        if (!permission.UserHasPermission(player.UserIDString, PERM_USE))
        {
            player.ChatMessage("You don't have permission to use this.");
            return;
        }

        player.ChatMessage("Hello from ${sanitizeClassName(meta.name || "MyCarbonPlugin")}!");
    }
}
`,

  snippets: {
    chatCommand: `// Register a chat command
[ChatCommand("example")]
private void CmdExample(BasePlayer player, string command, string[] args)
{
    player.ChatMessage("Example command executed.");
}`,
    saveLoadData: `// Basic data storage using Oxide datafile system
private StoredData data;

class StoredData {
    public Dictionary<ulong, int> counts = new Dictionary<ulong, int>();
}

void OnServerInitialized()
{
    LoadData();
}

void Unload() { SaveData(); }

void LoadData()
{
    data = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("MyPluginData") ?? new StoredData();
}

void SaveData()
{
    Interface.Oxide.DataFileSystem.WriteObject("MyPluginData", data);
}`,
    permissionCheck: `// Permission constant and check
private const string PERM_USE = "myplugin.use";

void Init()
{
    if (!permission.PermissionExists(PERM_USE))
        permission.RegisterPermission(PERM_USE, this);
}

bool HasUsePerm(BasePlayer player) => permission.UserHasPermission(player.UserIDString, PERM_USE);`
  }
};

function sanitizeClassName(name){
  return String(name || '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/^[^A-Za-z_]+/, '') || 'MyPlugin';
}

export function getInitialTemplate(framework, meta){
  if (framework === 'carbon') return templates.carbonSkeleton(meta);
  return templates.oxideSkeleton(meta);
}