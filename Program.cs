using System.Linq;
using System.Text;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi.Models;
using TaskManagement.Data;
using TaskManagement.Services;
using TaskManagement.Mappings;
using TaskManagement.Hubs;
using TaskManagement.Middleware;
using TaskManagement.Filters;
using TaskManagement.Validators;

var builder = WebApplication.CreateBuilder(args);

// Sentry error monitoring — no-ops when Dsn is empty (safe for development)
var sentryDsn = builder.Configuration["Sentry:Dsn"];
if (!string.IsNullOrWhiteSpace(sentryDsn))
{
    builder.WebHost.UseSentry(o =>
    {
        o.Dsn = sentryDsn;
        o.TracesSampleRate = 0.1;
        o.Environment = builder.Environment.EnvironmentName;
    });
}

// Add services to the container.
// ValidationFilter (Filters/ValidationFilter.cs) is registered as a global action filter — it
// runs before every controller action, trims incoming strings, and merges both DataAnnotations
// (ModelState) and FluentValidation failures into one ApiResponse<T> 400 shape. The framework's
// own automatic ModelState-invalid 400 is suppressed so ValidationFilter is the single source
// of truth for the response shape (it still reads ModelState itself, so DataAnnotations keep
// working — they just get reshaped into ApiResponse<T> instead of ValidationProblemDetails).
builder.Services.AddControllers(options =>
{
    options.Filters.Add<ValidationFilter>();
});
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.SuppressModelStateInvalidFilter = true;
});
// Registers every IValidator<T> implementation in Validators/ (AuthValidators.cs,
// UserValidators.cs, RoleValidators.cs, ProjectValidators.cs, TaskValidators.cs,
// WorkDiaryValidators.cs, TemplateValidators.cs, ChatValidators.cs) with DI so
// ValidationFilter can resolve them by request-DTO type.
builder.Services.AddValidatorsFromAssemblyContaining<LoginDtoValidator>();

// Whenever a validator message embeds the {PropertyName} token, FluentValidation resolves it
// through this DisplayNameResolver — by default that's just the raw C# property name
// ("FirstName"), which reads badly in a client-facing message. This turns "FirstName" into
// "First name" (PascalCase-split, sentence-cased) so messages like "{PropertyName} is
// required." become a natural, standalone sentence: "First name is required." — no separate
// "FieldName: " prefix needed anywhere downstream (see ValidationFilter.FormatFailure).
FluentValidation.ValidatorOptions.Global.DisplayNameResolver = (_, member, _) =>
{
    var name = member?.Name;
    if (string.IsNullOrEmpty(name)) return name;
    var spaced = System.Text.RegularExpressions.Regex.Replace(name, "(?<=[a-z0-9])(?=[A-Z])", " ");
    return char.ToUpperInvariant(spaced[0]) + spaced[1..].ToLowerInvariant();
};

// JWT Configuration
var jwtKey = builder.Configuration["JwtSettings:Key"] ?? "PMS_Secure_Key_For_JWT_Token_2024_MinLength32Chars";
var jwtIssuer = builder.Configuration["JwtSettings:Issuer"] ?? "PMS";
var jwtAudience = builder.Configuration["JwtSettings:Audience"] ?? "PMS";

var secretKey = Encoding.UTF8.GetBytes(jwtKey);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(secretKey)
        };
        // Allow SignalR to receive token via query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) &&
                    ctx.Request.Path.StartsWithSegments("/hubs"))
                {
                    ctx.Token = token;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// Database Configuration
// Note: transient deadlocks against the remote SQL Server host (see appsettings.json) do occur
// under load — EF Core's own diagnostic message for these points at EnableRetryOnFailure, but
// that requires every explicit `_context.Database.BeginTransactionAsync()` call (14 across
// Services/, e.g. TaskService.StartTaskAsync/MarkAllChecklistCompleteAsync) to be rewrapped in
// `Database.CreateExecutionStrategy().ExecuteAsync(...)` first, or each of those endpoints
// throws "The configured execution strategy does not support user-initiated transactions"
// instead. Left as-is deliberately — that's a real, separate refactor, not a one-line fix.
builder.Services.AddDbContext<PMSDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// AutoMapper
builder.Services.AddAutoMapper(typeof(MappingProfile));

// SignalR
builder.Services.AddSignalR();

// Business Services
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddScoped<IProjectService, ProjectService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IRoleService, RoleService>();
builder.Services.AddScoped<IActivityService, ActivityService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IChatService, ChatService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddScoped<IWorkDiaryService, WorkDiaryService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IOtpService, OtpService>();
builder.Services.AddScoped<ITaskTemplateService, TaskTemplateService>();
builder.Services.AddHostedService<TaskTemplateSchedulerService>();
builder.Services.AddHostedService<OtpCleanupService>();
builder.Services.AddSingleton<IOnlineUserTracker, OnlineUserTracker>();

// Database Initialization
builder.Services.AddScoped<IDatabaseInitializer, DatabaseInitializer>();

// Database Backup
// builder.Services.AddScoped<IDatabaseBackupService, DatabaseBackupService>();

// Authorization
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IAuthorizationService, AuthorizationService>();

// Swagger Configuration
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    // Add JWT Authentication
    var jwtSecurityScheme = new OpenApiSecurityScheme
    {
        BearerFormat = "JWT",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = JwtBearerDefaults.AuthenticationScheme,
        Description = "Enter 'Bearer' [space] and then your token in the text input below.\n\nExample: \"Bearer abc123def456\"",
    };

    options.AddSecurityDefinition("Bearer", jwtSecurityScheme);

    // Make sure Swagger UI requires the JWT token
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:5178")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.UseMiddleware<LoginRateLimitMiddleware>();

app.UseHttpsRedirection();

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();

app.UseCors("AllowAll");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");

app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    // Database init (migrate + seed) must NOT be able to take the whole host down.
    // On shared hosting the remote SQL server can be cold/slow/unreachable at cold start;
    // if MigrateAsync/seeding throws here, an unhandled exception aborts app.Run() and every
    // request — including the static SPA/login page — returns 500. Log and continue instead,
    // so the app still boots and serves. (Data-dependent endpoints will surface their own
    // errors, and the logged exception tells us the real cause.)
    try
    {
        var databaseInitializer = scope.ServiceProvider.GetRequiredService<IDatabaseInitializer>();
        await databaseInitializer.InitializeAsync();
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Database initialization failed at startup; continuing so the app can still serve requests.");
    }
}

app.Run();
