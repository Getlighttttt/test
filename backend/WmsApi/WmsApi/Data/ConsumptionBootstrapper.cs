using Microsoft.EntityFrameworkCore;
using WmsApi.Models;

namespace WmsApi.Data;

// Creates a small, repeatable historical dataset for testing ML and analytics.
// Does not create real pallets or warehouse movements.
public static class ConsumptionBootstrapper
{
    private const int RecordsPerLine = 1000;
    private const int HistoryDays = 180;
    private const string SyntheticSource = "synthetic";

    private sealed record PalletSize(int Quantity, int MinMinutes, int MaxMinutes);
    private sealed record MaterialTemplate(string Code, string Unit, PalletSize[] Sizes);
    private sealed record LineTemplate(string Name, MaterialTemplate[] Materials);

    private static readonly LineTemplate[] Lines =
    {
        new("L1", new[]
        {
            new MaterialTemplate("MAT-001", "ks", new[]
            {
                new PalletSize(100, 40, 55),
                new PalletSize(200, 80, 110)
            }),
            new MaterialTemplate("MAT-002", "ks", new[]
            {
                new PalletSize(300, 40, 55),
                new PalletSize(500, 70, 90)
            })
        }),
        new("L2", new[]
        {
            new MaterialTemplate("MAT-002", "ks", new[]
            {
                new PalletSize(300, 40, 55),
                new PalletSize(500, 70, 90)
            }),
            new MaterialTemplate("MAT-003", "m", new[]
            {
                new PalletSize(100, 30, 45),
                new PalletSize(200, 60, 90)
            })
        })
    };

    public static int Seed(Db2Context db)
    {
        // Like the sample order seeder: do not overwrite existing records.
        // A group is seeded once, even if the application is restarted.
        var existingGroups = db.LineConsumptionLogs.AsNoTracking()
            .Where(x => x.Source == SyntheticSource)
            .Select(x => new { x.LineName, x.ProductCode })
            .Distinct()
            .ToList()
            .Select(x => (x.LineName, x.ProductCode))
            .ToHashSet();

        if (Lines.All(line => line.Materials.All(material =>
                existingGroups.Contains((line.Name, material.Code)))))
            return 0;

        // Use the 180 days up to yesterday, to avoid creating future events.
        var lastDay = DateOnly.FromDateTime(DateTime.UtcNow.Date.AddDays(-1));
        var firstDay = lastDay.AddDays(-(HistoryDays - 1));
        var workingDays = Enumerable.Range(0, HistoryDays)
            .Select(i => firstDay.AddDays(i))
            .Where(day => day.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday)
            .ToArray();

        var generated = new List<LineConsumptionLog>(Lines.Length * RecordsPerLine);

        for (var lineIndex = 0; lineIndex < Lines.Length; lineIndex++)
        {
            var line = Lines[lineIndex];
            var random = new Random(20261103 + lineIndex);

            // For two materials: exactly 500 records of each, in random order.
            var sequence = Enumerable.Range(0, RecordsPerLine)
                .Select(i => line.Materials[i % line.Materials.Length])
                .ToArray();

            for (var i = sequence.Length - 1; i > 0; i--)
            {
                var j = random.Next(i + 1);
                (sequence[i], sequence[j]) = (sequence[j], sequence[i]);
            }

            DateOnly? previousDay = null;
            DateTime previousEnd = default;

            for (var i = 0; i < sequence.Length; i++)
            {
                var material = sequence[i];
                // Spread records evenly over workdays, preserving the date order.
                var day = workingDays[i * workingDays.Length / RecordsPerLine];
                var start = previousDay != day
                    ? day.ToDateTime(new TimeOnly(6, 0), DateTimeKind.Utc)
                        .AddMinutes(random.Next(0, 46))
                    : previousEnd.AddMinutes(random.Next(5, 21));

                // First choose a complete pallet size, then a matching duration.
                var pallet = material.Sizes[random.Next(material.Sizes.Length)];
                var minutes = random.Next(pallet.MinMinutes, pallet.MaxMinutes + 1);
                var end = start.AddMinutes(minutes);

                previousDay = day;
                previousEnd = end;

                // Still advance the simulated schedule for groups already seeded.
                if (existingGroups.Contains((line.Name, material.Code)))
                    continue;

                generated.Add(new LineConsumptionLog
                {
                    PalletCode = null,
                    ProductCode = material.Code,
                    LineName = line.Name,
                    PeriodStart = start,
                    PeriodEnd = end,
                    QuantityConsumed = pallet.Quantity,
                    Unit = material.Unit,
                    Source = SyntheticSource,
                    RecordedAt = day
                });
            }
        }

        if (generated.Count == 0)
            return 0;

        // Order generated insertions by time so new IDs are chronological.
        // SaveChanges is transactional: failures do not leave half a seed run.
        db.LineConsumptionLogs.AddRange(generated
            .OrderBy(x => x.PeriodStart)
            .ThenBy(x => x.LineName)
            .ThenBy(x => x.ProductCode));
        db.SaveChanges();
        return generated.Count;
    }
}
