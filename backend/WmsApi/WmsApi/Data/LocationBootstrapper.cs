using WmsApi.Models;

namespace WmsApi.Data;

/// <summary>
/// Adds missing location records without changing or deleting existing pallets or locations.
/// Run after DbSeeder.Seed so this works with both fresh and existing database volumes.
/// </summary>
public static class LocationBootstrapper
{
    public static void EnsureLocations(Db1Context db)
    {
        var existingCodes = db.Locations.Select(x => x.Code)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missing = new List<Location>();

        void AddIfMissing(string code, string zone)
        {
            if (existingCodes.Add(code))
                missing.Add(new Location { Code = code, Zone = zone, IsFree = true });
        }

        // Exclusive storage slots: one pallet per position (enforced by the storage API).
        for (int i = 1; i <= 25; i++)
        {
            AddIfMissing($"LOC-A{i}", Zone.Storage);
            AddIfMissing($"LOC-B{i}", Zone.Storage);
        }

        // Shared holding areas: multiple pallets may reference the same LocationId.
        AddIfMissing("LOC-REC1", Zone.Receiving);
        AddIfMissing("LOC-QUAR1", Zone.Quarantine);
        AddIfMissing("LOC-LINE1", Zone.LineBuffer);
        AddIfMissing("LOC-REWORK1", Zone.Rework);
        AddIfMissing("LOC-CLAIM1", Zone.Claim);

        if (missing.Count == 0) return;
        db.Locations.AddRange(missing);
        db.SaveChanges();
    }
}
