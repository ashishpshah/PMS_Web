using System.Linq;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
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
builder.Services.AddControllers();

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

// Working-hours configuration (default 10:00–19:00, overridable via appsettings "WorkingHours")
builder.Services.Configure<WorkingHoursOptions>(builder.Configuration.GetSection("WorkingHours"));

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
    // Apply working-hours config to the static helper before first request
    var whOpts = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<WorkingHoursOptions>>().Value;
    EffortHelpers.Configure(whOpts);

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
